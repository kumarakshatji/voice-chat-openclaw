const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

const callButton = document.querySelector("#callButton");
const callLabel = document.querySelector("#callLabel");
const statusDot = document.querySelector("#statusDot");
const statusText = document.querySelector("#statusText");
const speechSupport = document.querySelector("#speechSupport");
const heardText = document.querySelector("#heardText");
const responseText = document.querySelector("#responseText");

let recognition;
let callActive = false;
let listening = false;
let requestActive = false;
let speaking = false;

function setStatus(text, state = "ready") {
  statusText.textContent = text;
  statusDot.classList.toggle("busy", state === "busy");
  statusDot.classList.toggle("error", state === "error");
}

function setCallButton(active) {
  callButton.classList.toggle("active", active);
  callButton.setAttribute("aria-pressed", String(active));
  callLabel.textContent = active ? "End call" : "Start call";
}

function stopListening() {
  if (listening) recognition.stop();
}

function beginListening() {
  if (!callActive || requestActive || speaking || listening) return;

  try {
    recognition.start();
  } catch {
    // Some browsers complete an end event after accepting the next start call.
  }
}

function speak(text) {
  if (!text || !("speechSynthesis" in window)) return false;

  speaking = true;
  setStatus("OpenClaw is speaking", "busy");
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1;
  utterance.pitch = 1;
  utterance.onend = () => {
    speaking = false;
    if (callActive) beginListening();
  };
  utterance.onerror = () => {
    speaking = false;
    setStatus("Could not play the response", "error");
    if (callActive) beginListening();
  };
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
  return true;
}

async function sendTurn(message) {
  if (!message || requestActive || !callActive) return;

  requestActive = true;
  heardText.textContent = message;
  setStatus("OpenClaw is thinking", "busy");
  stopListening();

  try {
    const response = await fetch("/api/openclaw", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "OpenClaw request failed");

    const text = String(payload.text || "").trim();
    if (!text) throw new Error("OpenClaw returned no readable response.");

    responseText.textContent = text;
    if (!speak(text)) setStatus("Response received. Voice output is unavailable.", "error");
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    responseText.textContent = details;
    setStatus(details, "error");
  } finally {
    requestActive = false;
    if (callActive && !speaking) beginListening();
  }
}

async function startCall() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus("Microphone access requires Chrome or Edge on localhost or HTTPS", "error");
    return;
  }

  callButton.disabled = true;
  setStatus("Requesting microphone access", "busy");

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    callActive = true;
    setCallButton(true);
    responseText.textContent = "I am here. Start speaking when ready.";
    beginListening();
  } catch (error) {
    const denied = error instanceof DOMException && error.name === "NotAllowedError";
    setStatus(
      denied
        ? "Microphone permission was denied. Allow it in browser settings and try again."
        : "Could not start the microphone.",
      "error",
    );
  } finally {
    callButton.disabled = false;
  }
}

function endCall() {
  callActive = false;
  requestActive = false;
  stopListening();
  window.speechSynthesis?.cancel();
  speaking = false;
  setCallButton(false);
  setStatus("Call ended");
}

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.lang = navigator.language || "en-US";
  recognition.interimResults = true;
  recognition.continuous = false;

  recognition.onstart = () => {
    listening = true;
    setStatus("Listening", "busy");
  };

  recognition.onresult = (event) => {
    let interim = "";
    let final = "";

    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const text = result[0]?.transcript || "";
      if (result.isFinal) final += text;
      else interim += text;
    }

    heardText.textContent = (final || interim).trim() || "Listening...";
    if (final.trim()) void sendTurn(final.trim());
  };

  recognition.onerror = (event) => {
    const errors = {
      "not-allowed": "Microphone permission was denied. Allow it in browser settings and try again.",
      "service-not-allowed": "Speech Recognition is disabled by this browser.",
      "audio-capture": "No microphone was found or it is in use by another app.",
      network: "Speech Recognition needs a network connection.",
    };
    const error = errors[event.error] || `Mic error: ${event.error}`;
    setStatus(error, "error");
    if (event.error !== "no-speech") {
      callActive = false;
      requestActive = false;
      speaking = false;
      window.speechSynthesis?.cancel();
      setCallButton(false);
    }
  };

  recognition.onend = () => {
    listening = false;
    if (callActive && !requestActive && !speaking) {
      window.setTimeout(beginListening, 180);
    }
  };

  speechSupport.textContent = "Voice input uses your browser's Speech Recognition. Chrome on localhost is recommended.";
} else {
  callButton.disabled = true;
  speechSupport.textContent = "This browser does not support Speech Recognition. Open this page in Chrome.";
}

callButton.addEventListener("click", () => {
  if (callActive) endCall();
  else void startCall();
});
