import { useState, useRef } from "react";
import { Audio } from "expo-av";

export function useWhisper() {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isListening, setIsListening] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);

  const startListening = async () => {
    try {
      console.log("Starting recording...");

      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        alert("Microphone permission is required.");
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      recordingRef.current = recording;
      setRecording(recording);
      setIsListening(true);

    } catch (error) {
      console.error("Error starting recording:", error);
    }
  };

  const stopListening = async () => {
    try {
      console.log("Stopping recording...");
      const current = recordingRef.current;
      if (!current) return;

      await current.stopAndUnloadAsync();
      const uri = current.getURI();

      setIsListening(false);
      recordingRef.current = null;
      setRecording(null);
      return uri;
    } catch (error) {
      console.error("Error stopping recording:", error);
    }
  };

  return {
    startListening,
    stopListening,
    isListening,
  };
} 
