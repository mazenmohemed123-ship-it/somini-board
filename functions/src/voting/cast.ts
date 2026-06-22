/**
 * castVote — callable. A registered voter (uid == voterId) casts a ballot.
 * All integrity checks run server-side inside a transaction:
 *   - election must be active and within its window,
 *   - candidate must exist,
 *   - voter must not have already voted (first cast only — changes go through
 *     changeVote),
 *   - on success we write the ballot, flip hasVoted, set changeVoteUntil, and
 *     bump the live RTDB tally.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, rtdb, FieldValue, ServerValue, REGION } from "../lib/admin";

interface CastVoteData {
  electionId: string;
  candidateId: string;
}

export const castVote = onCall(
  { region: REGION, enforceAppCheck: true },
  async (request) => {
    const { auth } = request;
    if (!auth) throw new HttpsError("unauthenticated", "Sign in required.");
    if (auth.token.role !== "voter") {
      throw new HttpsError("permission-denied", "Only registered voters may vote.");
    }

    const { electionId, candidateId } = request.data as CastVoteData;
    if (!electionId || !candidateId) {
      throw new HttpsError("invalid-argument", "electionId and candidateId are required.");
    }
    if (auth.token.electionId && auth.token.electionId !== electionId) {
      throw new HttpsError("permission-denied", "Token is not valid for this election.");
    }

    const voterId = auth.uid;
    const electionRef = db.collection("elections").doc(electionId);
    const voterRef = electionRef.collection("voters").doc(voterId);
    const candidateRef = electionRef.collection("candidates").doc(candidateId);
    const voteRef = electionRef.collection("votes").doc(voterId); // one ballot per voter

    await db.runTransaction(async (tx) => {
      const [electionSnap, voterSnap, candidateSnap] = await Promise.all([
        tx.get(electionRef),
        tx.get(voterRef),
        tx.get(candidateRef),
      ]);

      if (!electionSnap.exists) throw new HttpsError("not-found", "Election not found.");
      if (!voterSnap.exists) throw new HttpsError("permission-denied", "Voter not registered.");
      if (!candidateSnap.exists) throw new HttpsError("not-found", "Candidate not found.");

      const election = electionSnap.data()!;
      const now = new Date();
      if (
        election.status !== "active" ||
        election.startDate.toDate() > now ||
        election.endDate.toDate() < now
      ) {
        throw new HttpsError("failed-precondition", "Election is not open for voting.");
      }
      if (voterSnap.data()!.hasVoted === true) {
        throw new HttpsError("already-exists", "You have already voted. Use change vote instead.");
      }

      const changeWindowMin = election.changeVoteWindow ?? 0;
      const changeVoteUntil =
        changeWindowMin > 0 ? new Date(now.getTime() + changeWindowMin * 60_000) : null;

      tx.set(voteRef, {
        voteId: voterId,
        voterId,
        candidateId,
        tenantId: election.tenantId,
        timestamp: FieldValue.serverTimestamp(),
      });
      tx.update(voterRef, {
        hasVoted: true,
        votedFor: candidateId,
        changeVoteUntil,
        votedAt: FieldValue.serverTimestamp(),
      });
    });

    // Live tally (eventually consistent, display-only).
    await rtdb
      .ref(`elections/${electionId}/liveResults/${candidateId}`)
      .set(ServerValue.increment(1));

    return { ok: true };
  }
);
