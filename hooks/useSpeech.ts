import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';

export function useVoice() {
  const {
    transcript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition,
  } = useSpeechRecognition();

  const start = () => {
    if (!browserSupportsSpeechRecognition) {
      console.log("Speech recognition not supported");
      return;
    }
    SpeechRecognition.startListening({ continuous: true, language: 'en-IN' });
  };

  const stop = () => {
    SpeechRecognition.stopListening();
  };

  return {
    transcript,
    listening,
    start,
    stop,
    resetTranscript,
    browserSupportsSpeechRecognition,
  };
}
