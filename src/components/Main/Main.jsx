import React, { useContext, useState } from "react";
import "./Main.css";
import { assets } from "../../assets/assets";
import { Context } from "../../context/Context";
import useVoiceRecorder from "../hooks/useVoiceRecorder";
import VoicePopup from "../VoicePopup.jsx"; // new popup component
import "../VoicePopup.css";

const Main = () => {
  const {
    showResult,
    loading,
    resultData,
    setResultData,
    setShowResult,
    setInput,
    input,
    setRecentPrompt,
  } = useContext(Context);

  const [lang, setLang] = useState("en");

  // popup state local to Main
  const [popupVisible, setPopupVisible] = useState(false);
  const [popupState, setPopupState] = useState("listening");
  const [popupPayload, setPopupPayload] = useState({});

  const onPopupState = (state, payload = {}) => {
    setPopupState(state);
    setPopupPayload(payload || {});
    // open modal for listening / processing
    if (state === "listening" || state === "transcribing" || state === "thinking" || state === "speaking" || state === "finished") {
      setPopupVisible(true);
    }
    if (state === "error") {
      setPopupVisible(true);
    }
  };

  // Voice Recorder Hook
  const recorder = useVoiceRecorder({
    lang,
    onFinalText: (userText, ragAnswer) => {
      // First → show STT text in input box
      if (userText) {
        setInput(userText);
        setRecentPrompt(userText);
      }

      // When RAG answer is returned → update screen
      if (ragAnswer) {
        setResultData(ragAnswer);
        setShowResult(true);
      }
    },
    onPopupState,
  });

  const handleMicClick = () => {
    // show popup and start or stop recording
    if (!recorder.recording) {
      setPopupVisible(true);
      recorder.startRecording();
    } else {
      recorder.stopRecording();
    }
  };

  const handlePopupStop = () => {
    recorder.stopRecording();
  };

  const handlePopupClose = () => {
    // ensure recorder stopped
    if (recorder.recording) recorder.stopRecording();
    setPopupVisible(false);
    setPopupState("idle");
    setPopupPayload({});
  };

  return (
    <div className="main">
      <VoicePopup
        visible={popupVisible}
        state={popupState}
        payload={popupPayload}
        onStopRecording={handlePopupStop}
        onClose={handlePopupClose}
      />

      <div className="nav">
        <p>Legal voice-bot</p>

        {/* Language selector */}
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value)}
          style={{
            padding: "6px",
            borderRadius: "8px",
            marginRight: "10px"
          }}
        >
          <option value="en">English</option>
          <option value="hi">Hindi</option>
        </select>

        <img
          width="40"
          height="40"
          src="https://img.icons8.com/ios-filled/50/user-male-circle.png"
          alt="profile"
        />
      </div>

      <div className="main-container">

        {showResult ? (
          <div className="result">
            <div className="result-title">
              <img src={assets.user_icon} alt="" />
              <p>{input}</p>
            </div>

            <div className="result-data">
              <img src={assets.gemini_icon} alt="" />

              {loading ? (
                <div className="loader">
                  <hr className="animated-bg" />
                  <hr className="animated-bg" />
                  <hr className="animated-bg" />
                </div>
              ) : (
                <p>{resultData}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="greet">
            <p><span>Hello, friend.</span></p>
            <p>How can I help you today?</p>
          </div>
        )}

        {/* Bottom Input Section */}
        <div className="main-bottom">
          <div className="search-box">

            <input
              onChange={(e) => setInput(e.target.value)}
              value={input}
              type="text"
              placeholder="Enter a prompt here"
              onKeyDown={(e) => {
                if (e.key === "Enter" && input.trim()) {
                  recorder.sendToRAG(input);     // backend + TTS
                }
              }}
            />

            <div>
              <img src={assets.gallery_icon} width={30} alt="" />

              {/* MIC */}
              <img
                src={assets.mic_icon}
                width={30}
                alt="mic"
                onClick={handleMicClick}
                style={{
                  opacity: recorder.recording ? 0.5 : 1,
                  cursor: "pointer"
                }}
              />

              {/* SEND */}
              {input && (
                <img
                  onClick={() => recorder.sendToRAG(input)}
                  src={assets.send_icon}
                  width={30}
                  alt="send"
                />
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Main;
