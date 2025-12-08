import Constants from "expo-constants";

export async function transcribeAudio(uri: string) {
  const apiKey = Constants.expoConfig?.extra?.OPENAI_API_KEY;

  const audioFile = {
    uri,
    type: "audio/m4a",
    name: "audio.m4a",
  };

  const formData = new FormData();
  formData.append("file", audioFile as any);
  formData.append("model", "whisper-1");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  const json = await response.json();
  console.log("Whisper Response:", json);

  return json.text;
}
