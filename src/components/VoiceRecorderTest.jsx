import React, { useRef, useState } from "react";

export default function VoiceRecorder({ lang = "en", onFinalText }) {
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState("idle");

  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timeoutRef = useRef(null);
  const MAX_MS = 8000;

  const STT_API_URL = "http://127.0.0.1:5000/audio/stt";
  const RAG_API_URL = "http://127.0.0.1:5000/rag/query";
  const TTS_API_URL = "http://127.0.0.1:5000/audio/tts";

  // ⭐ Start Recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });

      mediaRecorderRef.current = mr;
      chunksRef.current = [];

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstart = () => {
        setRecording(true);
        setStatus("recording");
      };

      mr.onstop = () => {
        setRecording(false);
        setStatus("processing");

        const blob = new Blob(chunksRef.current, { type: "audio/webm" });

        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
        }

        uploadToSTT(blob);
      };

      mr.start();

      timeoutRef.current = setTimeout(() => {
        if (mediaRecorderRef.current?.state !== "inactive") {
          mediaRecorderRef.current.stop();
        }
      }, MAX_MS);
    } catch (err) {
      console.error("Mic error:", err);
      setStatus("error");
    }
  };

  // ⭐ Stop Recording
  const stopRecording = () => {
    clearTimeout(timeoutRef.current);
    if (mediaRecorderRef.current?.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  };

  // ⭐ Upload → STT
  const uploadToSTT = async (blob) => {
    try {
      const file = new File([blob], "audio.webm", { type: "audio/webm" });
      const formData = new FormData();
      formData.append("audio", file);

      const response = await fetch(STT_API_URL, { method: "POST", body: formData });
      const text = await response.text();

      // Send transcription up to Main.jsx
      onFinalText(text);

      sendToRAG(text);
    } catch (err) {
      console.error("STT Error:", err);
      setStatus("error");
    }
  };

  // ⭐ STT → RAG
  const sendToRAG = async (text) => {
    try {
      const response = await fetch(RAG_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: text }),
      });

      const data = await response.json();

      playTTS(data.text);
    } catch (err) {
      console.error("RAG Error:", err);
    }
  };

  // ⭐ RAG → TTS
  const playTTS = async (text) => {
    try {
      const response = await fetch(TTS_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, lang }),
      });

      const buf = await response.arrayBuffer();
      const audioUrl = URL.createObjectURL(new Blob([buf], { type: "audio/mpeg" }));

      new Audio(audioUrl).play();
    } catch (err) {
      console.error("TTS Error:", err);
    }
  };

  // ⭐ Expose recording controls to parent (Main.jsx)
  return {
    startRecording,
    stopRecording,
    recording,
    status,
  };
}
