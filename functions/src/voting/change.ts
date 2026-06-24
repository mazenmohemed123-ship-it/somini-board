/**
 * changeVote — callable. A voter changes their already-cast ballot, but only
 * while inside the change-vote window the admin configured (changeVoteUntil).
 * Once that timestamp passes the ballot is final and this rejects.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, rtdb, FieldValue, ServerValue, REGION, ENFORCE_APP_CHECK } from "../lib/admin";

interface ChangeVoteData {
  electionId: string;
  candidateId: string;
}

export const changeVote = onCall(
  { region: REGION, enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) => {
    const { auth } = request;
    if (!auth) throw new HttpsError("unauthenticated", "Sign in required.");
    if (auth.token.role !== "voter") {
      throw new HttpsError("permission-denied", "Only registered voters may vote.");
    }

    const { electionId, candidateId } = request.data as ChangeVoteData;
    if (!electionId || !candidateId) {
      throw new HttpsError("invalid-argument", "electionId and candidateId are required.");
    }

    const voterId = auth.uid;
    const electionRef = db.collection("elections").doc(electionId);
    const voterRef = electionRef.collection("voters").doc(voterId);
    const candidateRef = electionRef.collection("candidates").doc(candidateId);
    const voteRef = electionRef.collection("votes").doc(voterId);

    let previousCandidate: string | null = null;

    await db.runTransaction(async (tx) => {
      const [electionSnap, voterSnap, candidateSnap, voteSnap] = await Promise.all([
        tx.get(electionRef),
        tx.get(voterRef),
        tx.get(candidateRef),
        tx.get(voteRef),
      ]);

      if (!voterSnap.exists || !voteSnap.exists) {
        throw new HttpsError("failed-precondition", "No existing vote to change.");
      }
      if (!candidateSnap.exists) throw new HttpsError("not-found", "Candidate not found.");

      const election = electionSnap.data()!;
      const voter = voterSnap.data()!;
      const now = new Date();

      if (election.status !== "active") {
        throw new HttpsError("failed-precondition", "Election is not active.");
      }
      const until = voter.changeVoteUntil ? voter.changeVoteUntil.toDate() : null;
      if (!until || until < now) {
        throw new HttpsError("failed-precondition", "The change-vote window has closed.");
      }

      previousCandidate = voter.votedFor ?? voteSnap.data()!.candidateId;
      if (previousCandidate === candidateId) {
        return; // no-op, same candidate
      }

      tx.update(voteRef, {
        candidateId,
        changedAt: FieldValue.serverTimestamp(),
        timestamp: FieldValue.serverTimestamp(),
      });
      tx.update(voterRef, { votedFor: candidateId });
    });

    // Adjust live tallies if the candidate actually changed.
    if (previousCandidate && previousCandidate !== candidateId) {
      await Promise.all([
        rtdb.ref(`elections/${electionId}/liveResults/${previousCandidate}`).set(ServerValue.increment(-1)),
        rtdb.ref(`elections/${electionId}/liveResults/${candidateId}`).set(ServerValue.increment(1)),
      ]);
    }

    return { ok: true };
  }
);
