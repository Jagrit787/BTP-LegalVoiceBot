import { createContext, useState } from "react";

export const Context = createContext();

const ContextProvider = (props) => {
  const [prevPrompts, setPrevPrompts] = useState([]);
  const [input, setInput] = useState("");
  const [recentPrompt, setRecentPrompt] = useState("");
  const [showResult, setShowResult] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resultData, setResultData] = useState("");

  /**
   * ❌ OLD: onSent used Gemini
   * ✅ NEW: onSent is now used ONLY when typing manually.
   * The Voice Recorder directly calls sendToRAG → backend → TTS.
   */
  const onSent = async (prompt) => {
    if (!prompt || !prompt.trim()) return;

    setLoading(true);
    setShowResult(true);
    setResultData("");

    // This only stores prompt and "waits" for recorder/sendToRAG to update resultData.
    setRecentPrompt(prompt);
    setPrevPrompts((prev) => [...prev, prompt]);
    setInput("");

    // The actual RAG/TTS pipeline is handled in useVoiceRecorder.
    // This onSent no longer calls ANY LLM.
    setLoading(false);
  };

  const newChat = () => {
    setInput("");
    setRecentPrompt("");
    setResultData("");
    setShowResult(false);
    setLoading(false);
  };

  const contextValue = {
    // sidebar
    prevPrompts,
    setPrevPrompts,

    // input/prompt management
    input,
    setInput,
    recentPrompt,
    setRecentPrompt,

    // result
    resultData,
    setResultData,
    showResult,
    setShowResult,
    loading,
    setLoading,

    // actions
    onSent,
    newChat,
  };

  return (
    <Context.Provider value={contextValue}>
      {props.children}
    </Context.Provider>
  );
};

export default ContextProvider;
