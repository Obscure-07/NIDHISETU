// ------------------------------------------------------------
// BeneficiaryLoanAssistantScreen.tsx
// Updated with Groq Whisper + m4a audio recording
// ------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
  Alert,
} from "react-native";
import Markdown from "react-native-markdown-display";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";

import { AppIcon } from "@/components/atoms/app-icon";
import { AppText } from "@/components/atoms/app-text";
import type { AppTheme } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useBeneficiaryData } from "@/hooks/use-beneficiary-data";

import {
  loanAssistantClient,
  type LoanAssistantMessage,
  type LoanContext,
} from "@/services/ai/loanAssistant";

import * as FileSystem from "expo-file-system";
import { Audio } from "expo-av";
import Constants from "expo-constants";

// ------------------------------------------------------------
// QUICK PROMPTS
// ------------------------------------------------------------
const QUICK_PROMPTS = [
  "What are the next steps in my loan?",
  "How do I upload missing documents?",
  "When will I get the subsidy?",
  "Explain my repayment schedule.",
  "Can I update my bank details?",
];

// ------------------------------------------------------------
// Typing Indicator
// ------------------------------------------------------------
const TypingIndicator = ({ theme }: { theme: AppTheme }) => {
  const pulse = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.3, duration: 500, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <View style={typingStyles.container}>
      {[0, 1, 2].map((idx) => (
        <Animated.View
          key={idx}
          style={[
            typingStyles.dot,
            {
              backgroundColor: theme.colors.primary,
              opacity: pulse,
              transform: [{ translateY: idx % 2 ? -1 : 0 }],
            },
          ]}
        />
      ))}
    </View>
  );
};

const formatNow = () =>
  new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

// ------------------------------------------------------------
// MAIN SCREEN
// ------------------------------------------------------------
export const BeneficiaryLoanAssistantScreen = () => {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { profile, loan } = useBeneficiaryData();

  const scrollViewRef = useRef<ScrollView>(null);

  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<LoanAssistantMessage[]>([]);
  const [isSending, setIsSending] = useState(false);

  // Voice States
  const recordingRef = useRef<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  // Loan context
  const context = useMemo<LoanContext>(
    () => ({
      beneficiaryName: profile?.name,
      loanAmount: loan?.loanAmount,
      bankName: loan?.bank,
    }),
    [profile?.name, loan?.loanAmount, loan?.bank]
  );

  useEffect(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages.length]);

  // ------------------------------------------------------------
  // AUDIO RECORDING
  // ------------------------------------------------------------
  const requestMicPermission = async () => {
    const { status } = await Audio.requestPermissionsAsync();
    return status === "granted";
  };

  const startRecording = async () => {
    try {
      const granted = await requestMicPermission();
      if (!granted) {
        Alert.alert("Permission Required", "Microphone access is required for voice input.");
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const recording = new Audio.Recording();

      await recording.prepareToRecordAsync({
        android: {
          extension: ".m4a",
          outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 128000,
        },
        ios: {
          extension: ".m4a",
          audioQuality: Audio.IOSAudioQuality.MAX,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 128000,
          outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
        },
        web: {
          mimeType: "audio/webm",
          bitsPerSecond: 128000,
        },
      });

      await recording.startAsync();

      recordingRef.current = recording;
      setIsRecording(true);

      console.log("Recording started");
    } catch (e) {
      console.error("startRecording error:", e);
    }
  };

  const stopRecording = async () => {
    try {
      const recording = recordingRef.current;
      if (!recording) return null;

      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      recordingRef.current = null;
      setIsRecording(false);

      console.log("Recording stopped:", uri);
      return uri;
    } catch (e) {
      console.error("stopRecording error:", e);
      setIsRecording(false);
      return null;
    }
  };

  // ------------------------------------------------------------
  // GROQ WHISPER TRANSCRIPTION
  // ------------------------------------------------------------
  const transcribeWithGroq = async (fileUri: string) => {
    try {
      setIsTranscribing(true);

      const apiKey =
        Constants.expoConfig?.extra?.GROQ_API_KEY ||
        process.env.EXPO_PUBLIC_GROQ_API_KEY;

      if (!apiKey) {
        Alert.alert("Missing API Key", "Groq API key not found!");
        setIsTranscribing(false);
        return "";
      }

      const filename = fileUri.split("/").pop() ?? "audio.m4a";

      const formData = new FormData();
      // @ts-ignore
      formData.append("file", {
        uri: fileUri,
        name: filename,
        type: "audio/m4a",
      });

      formData.append("model", "whisper-large-v3-turbo");

      const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
      });

      const text = await res.text();
      console.log("Groq Raw Response:", text);

      if (!res.ok) {
        console.log("Groq Whisper Error:", res.status, text);
        setIsTranscribing(false);
        return "";
      }

      const json = JSON.parse(text);
      setIsTranscribing(false);
      return json.text || "";
    } catch (err) {
      console.error("Groq transcription error:", err);
      setIsTranscribing(false);
      return "";
    }
  };

  // ------------------------------------------------------------
  // MIC BUTTON HANDLER
  // ------------------------------------------------------------
  const onMicPress = async () => {
    if (isRecording) {
      const uri = await stopRecording();
      if (!uri) return;

      const text = await transcribeWithGroq(uri);
      if (text) setInput(text);

      try {
        await FileSystem.deleteAsync(uri, { idempotent: true });
      } catch {}
    } else {
      startRecording();
    }
  };

  // ------------------------------------------------------------
  // SEND MESSAGE
  // ------------------------------------------------------------
  const handleSend = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");
    setIsSending(true);

    try {
      const reply = await loanAssistantClient.sendMessage(
        [...messages, { role: "user", content: trimmed }],
        context
      );

      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, please try again." },
      ]);
    }

    setIsSending(false);
  };

  // ------------------------------------------------------------
  // WELCOME STATE
  // ------------------------------------------------------------
  const renderWelcomeState = () => (
    <View style={styles.welcomeContainer}>
      <AppText style={{ fontSize: 18 }}>Hi {profile?.name || "there"} 👋</AppText>
      <AppText>Ask anything about your loan journey.</AppText>

      <View style={styles.chipsGrid}>
        {QUICK_PROMPTS.map((p) => (
          <TouchableOpacity key={p} style={styles.chip} onPress={() => handleSend(p)}>
            <AppText>{p}</AppText>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  // ------------------------------------------------------------
  // RENDER UI
  // ------------------------------------------------------------
  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.chatCard}>
          <ScrollView
            ref={scrollViewRef}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {messages.length === 0 ? (
              renderWelcomeState()
            ) : (
              messages.map((msg, i) => (
                <View
                  key={i}
                  style={[
                    styles.messageBubble,
                    msg.role === "user" ? styles.userBubble : styles.botBubble,
                  ]}
                >
                  {msg.role === "assistant" ? (
                    <Markdown>{msg.content}</Markdown>
                  ) : (
                    <AppText style={{ color: "#fff" }}>{msg.content}</AppText>
                  )}
                  <AppText style={styles.timestamp}>{formatNow()}</AppText>
                </View>
              ))
            )}

            {isSending && (
              <View style={[styles.messageBubble, styles.botBubble]}>
                <TypingIndicator theme={theme} />
              </View>
            )}
          </ScrollView>

          {/* INPUT AREA */}
          <View style={styles.inputWrapper}>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Ask anything..."
                value={input}
                onChangeText={setInput}
                onSubmitEditing={() => handleSend(input)}
              />

              <TouchableOpacity
                style={[
                  styles.micButton,
                  { backgroundColor: isRecording ? "#fee2e2" : "#f1f5f9" },
                ]}
                onPress={onMicPress}
              >
                <AppIcon
                  name={
                    isRecording
                      ? "microphone"
                      : isTranscribing
                      ? "download"
                      : "microphone-outline"
                  }
                  size={22}
                  color={isRecording ? "red" : theme.colors.primary}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.sendButton, { backgroundColor: theme.colors.primary }]}
                onPress={() => handleSend(input)}
              >
                <AppIcon name="send" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

// ------------------------------------------------------------
// STYLES
// ------------------------------------------------------------
const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: "#f4f6fb" },

    chatCard: {
      flex: 1,
      margin: 16,
      backgroundColor: "#fff",
      borderRadius: 20,
      overflow: "hidden",
    },

    scrollContent: {
      padding: 20,
      paddingBottom: 120,
    },

    welcomeContainer: {
      marginTop: 30,
      alignItems: "center",
      gap: 20,
    },

    chipsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      marginTop: 20,
    },

    chip: {
      padding: 10,
      backgroundColor: "#eef2ff",
      borderRadius: 14,
    },

    messageBubble: {
      padding: 12,
      maxWidth: "80%",
      borderRadius: 14,
      marginBottom: 10,
    },

    userBubble: {
      alignSelf: "flex-end",
      backgroundColor: theme.colors.primary,
    },

    botBubble: {
      alignSelf: "flex-start",
      backgroundColor: "#f1f5f9",
      borderColor: "#cbd5e1",
      borderWidth: 1,
    },

    timestamp: {
      marginTop: 6,
      fontSize: 10,
      color: "#64748b",
    },

    inputWrapper: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      padding: 12,
    },

    inputContainer: {
      flexDirection: "row",
      alignItems: "center",
      padding: 10,
      borderRadius: 30,
      backgroundColor: "#fff",
      borderWidth: 1,
      borderColor: "#e2e8f0",
      gap: 10,
    },

    input: {
      flex: 1,
      fontSize: 16,
      paddingVertical: 6,
    },

    micButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#f1f5f9",
    },

    sendButton: {
      width: 45,
      height: 45,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
    },
  });

// Typing indicator styles
const typingStyles = StyleSheet.create({
  container: { flexDirection: "row", gap: 6, alignItems: "center" },
  dot: { width: 8, height: 8, borderRadius: 4 },
});

export default BeneficiaryLoanAssistantScreen;
