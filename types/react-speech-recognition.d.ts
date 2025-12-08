declare module 'react-speech-recognition' {
  import type { ComponentType } from 'react';

  export type ListeningOptions = {
    continuous?: boolean;
    language?: string;
  };

  export type SpeechRecognitionHooks = {
    transcript: string;
    interimTranscript: string;
    finalTranscript: string;
    listening: boolean;
    resetTranscript: () => void;
    browserSupportsSpeechRecognition: boolean;
    browserSupportsContinuousListening: boolean;
    isMicrophoneAvailable: boolean;
  };

  export const useSpeechRecognition: () => SpeechRecognitionHooks;

  export const SpeechRecognition: {
    startListening: (options?: ListeningOptions) => Promise<void> | void;
    stopListening: () => Promise<void> | void;
    abortListening: () => Promise<void> | void;
    browserSupportsSpeechRecognition: () => boolean;
    getRecognition: () => SpeechRecognition | undefined;
  };

  const SpeechToText: ComponentType;
  export default SpeechRecognition;
}
