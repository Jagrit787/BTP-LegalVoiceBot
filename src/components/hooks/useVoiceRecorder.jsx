// src/components/hooks/useVoiceRecorder.jsx
import { useRef, useState } from "react";

/**
 * Debuggable useVoiceRecorder
 *
 * onFinalText(userText|null, ragAnswer|null)
 * onPopupState(stateString, payloadObject)
 *
 * states: "listening" | "transcribing" | "thinking" | "speaking" | "finished" | "error" | "idle"
 */
export default function useVoiceRecorder({
  lang = "en",
  onFinalText,
  onPopupState,
}) {
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState("idle");

  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timeoutRef = useRef(null);

  const MAX_MS = 12000;
  const STT_API_URL = `${import.meta.env.VITE_BACKEND_URL}audio/stt`;
  const RAG_API_URL = `${import.meta.env.VITE_BACKEND_URL}rag/query`;
  const TTS_API_URL = `${import.meta.env.VITE_BACKEND_URL}audio/tts`;

  // safe caller for popup updates
  const safePopup = (state, payload = {}) => {
    try {
      console.debug("[recorder] safePopup ->", state, payload);
      onPopupState?.(state, payload);
    } catch (e) {
      console.error("[recorder] onPopupState threw:", e);
    }
  };

  const safeFinalText = (userText, ragAnswer) => {
    try {
      console.debug("[recorder] onFinalText ->", { userText, ragAnswer });
      onFinalText?.(userText, ragAnswer);
    } catch (e) {
      console.error("[recorder] onFinalText threw:", e);
    }
  };

  // Start recording
  const startRecording = async () => {
    console.debug("[recorder] startRecording called");
    try {
      setStatus("requesting");
      safePopup("listening", {});

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mr;
      chunksRef.current = [];

      mr.onstart = () => {
        console.debug("[recorder] mediaRecorder.onstart");
        setRecording(true);
        setStatus("listening");
        safePopup("listening", {});
      };

      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mr.onstop = async () => {
        console.debug("[recorder] mediaRecorder.onstop");
        setRecording(false);
        setStatus("processing");
        safePopup("transcribing", { sttText: "" });

        // stop tracks
        try {
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
          }
        } catch (err) {
          console.warn("[recorder] error stopping tracks:", err);
        }

        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        // upload and transcribe
        await uploadToSTT(blob);
      };

      mr.onerror = (ev) => {
        console.error("[recorder] mediaRecorder error:", ev);
        setStatus("error");
        safePopup("error", { error: String(ev) });
      };

      mr.start();
      console.debug("[recorder] mediaRecorder started");

      // safety timeout
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        try {
          if (
            mediaRecorderRef.current &&
            mediaRecorderRef.current.state !== "inactive"
          ) {
            console.debug("[recorder] timeout stopping mediaRecorder");
            mediaRecorderRef.current.stop();
          }
        } catch (e) {
          console.warn("[recorder] timeout stop error", e);
        }
      }, MAX_MS);
    } catch (err) {
      console.error("[recorder] startRecording failed:", err);
      setStatus("error");
      safePopup("error", { error: String(err) });
    }
  };

  // Stop recording
  const stopRecording = () => {
    console.debug("[recorder] stopRecording called");
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    try {
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        mediaRecorderRef.current.stop();
      } else {
        console.debug("[recorder] mediaRecorder already inactive or not set");
      }
    } catch (err) {
      console.error("[recorder] stopRecording error:", err);
      safePopup("error", { error: String(err) });
    }
  };

  // Upload recorded audio to STT endpoint
  const uploadToSTT = async (blob) => {
    console.debug("[recorder] uploadToSTT start");
    safePopup("transcribing", { sttText: "Uploading audio…" });
    setStatus("transcribing");

    try {
      const file = new File([blob], "audio.webm", { type: "audio/webm" });
      const fd = new FormData();
      fd.append("audio", file);

      const res = await fetch(STT_API_URL, { method: "POST", body: fd });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error("STT failed: " + res.status + " " + txt);
      }

      // some STT endpoints return JSON or text — handle both.
      let sttText;
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        const j = await res.json();
        sttText = j.translated_text ?? j.text ?? j.result ?? JSON.stringify(j);
      } else {
        sttText = await res.text();
      }
      console.debug("[recorder] STT result:", sttText);

      // pass STT to parent immediately
      safeFinalText(sttText, null);
      safePopup("thinking", { sttText });

      // now call RAG
      await sendToRAG(sttText);
    } catch (err) {
      console.error("[recorder] uploadToSTT error:", err);
      setStatus("error");
      safePopup("error", { error: String(err) });
    }
  };

  // Send text to RAG and then TTS (exposed publicly)
  const sendToRAG = async (text) => {
    console.debug("[recorder] sendToRAG start:", text);
    safePopup("thinking", { sttText: text });
    setStatus("thinking");

    try {
      const res = await fetch(RAG_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: text }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error("RAG failed: " + res.status + " " + txt);
      }
      const data = await res.json();
      const ragAnswer =
        data.text ??
        data.rag_answer ??
        (typeof data === "string" ? data : JSON.stringify(data));
      console.debug("[recorder] RAG answer:", ragAnswer);

      // notify parent
      safeFinalText(text, ragAnswer);

      // start TTS generation
      safePopup("speaking", { sttText: text, ragAnswer });
      setStatus("speaking");

      const audioUrl = await fetchTTSAndCreateURL(ragAnswer);
      if (!audioUrl) throw new Error("TTS returned no audio URL");

      console.debug("[recorder] TTS audioUrl:", audioUrl);
      safePopup("finished", { sttText: text, ragAnswer, audioUrl });

      setStatus("done");
      return { ragAnswer, audioUrl };
    } catch (err) {
      console.error("[recorder] sendToRAG error:", err);
      safePopup("error", { error: String(err) });
      setStatus("error");
      return null;
    }
  };

  const fetchTTSAndCreateURL = async (text) => {
    try {
      const res = await fetch(TTS_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, lang }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error("TTS failed: " + res.status + " " + txt);
      }
      const buf = await res.arrayBuffer();
      const blob = new Blob([buf], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);
      return url;
    } catch (err) {
      console.error("[recorder] fetchTTS error:", err);
      return null;
    }
  };

  // expose functions & state
  return {
    startRecording,
    stopRecording,
    sendToRAG,
    recording,
    status,
  };
}
