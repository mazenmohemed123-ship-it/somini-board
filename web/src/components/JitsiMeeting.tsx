"use client";

/**
 * Jitsi Meet embed using the external_api.js script (no self-hosted server).
 * Room name is derived from the meeting/event id so each has its own room.
 * Toolbar buttons are trimmed to keep the experience focused.
 */
import { useEffect, useRef } from "react";

declare global {
  interface Window {
    JitsiMeetExternalAPI?: any;
  }
}

export function JitsiMeeting({ electionId, roomId }: { electionId?: string; roomId?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<any>(null);
  const id = roomId || electionId;

  useEffect(() => {
    const DOMAIN = "meet.jit.si";
    const room = `SomniBoard-${id}`;

    function start() {
      if (!containerRef.current || !window.JitsiMeetExternalAPI) return;
      apiRef.current = new window.JitsiMeetExternalAPI(DOMAIN, {
        roomName: room,
        parentNode: containerRef.current,
        width: "100%",
        height: 500,
        configOverwrite: { prejoinPageEnabled: true, disableDeepLinking: true },
        interfaceConfigOverwrite: {
          TOOLBAR_BUTTONS: [
            "microphone", "camera", "desktop", "chat", "raisehand",
            "tileview", "hangup", "fullscreen",
          ],
        },
      });
    }

    if (window.JitsiMeetExternalAPI) {
      start();
    } else {
      const script = document.createElement("script");
      script.src = `https://${DOMAIN}/external_api.js`;
      script.async = true;
      script.onload = start;
      document.body.appendChild(script);
    }

    return () => {
      apiRef.current?.dispose?.();
    };
  }, [id]);

  return <div ref={containerRef} style={{ marginTop: 16, borderRadius: 12, overflow: "hidden" }} />;
}
