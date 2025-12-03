import AsyncStorage from '@react-native-async-storage/async-storage';
import { encode as base64Encode } from 'base-64';
import Constants from 'expo-constants';

const VERIFY_SERVICE_CACHE_KEY = 'nidhisetu.twilio.verifyServiceSid';
const VERIFY_FRIENDLY_NAME = 'NIDHISETU Verify';

const extraEnv = (Constants.expoConfig?.extra as { env?: Record<string, string | undefined> } | undefined)?.env ?? {};

const sanitizeEnvValue = (value?: string) => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'undefined' || trimmed === 'null') {
    return undefined;
  }
  return trimmed;
};

const accountSid = sanitizeEnvValue(process.env.EXPO_PUBLIC_TWILIO_ACCOUNT_SID) ?? sanitizeEnvValue(extraEnv.EXPO_PUBLIC_TWILIO_ACCOUNT_SID);
const authToken = sanitizeEnvValue(process.env.EXPO_PUBLIC_TWILIO_AUTH_TOKEN) ?? sanitizeEnvValue(extraEnv.EXPO_PUBLIC_TWILIO_AUTH_TOKEN);
const configuredServiceSid = sanitizeEnvValue(process.env.EXPO_PUBLIC_TWILIO_VERIFY_SERVICE_SID) ?? sanitizeEnvValue(extraEnv.EXPO_PUBLIC_TWILIO_VERIFY_SERVICE_SID);

const isVerifyServiceSid = (value?: string | null): value is string => !!value && value.startsWith('VA');

if (configuredServiceSid && !isVerifyServiceSid(configuredServiceSid)) {
  console.warn(
    'Configured Twilio Verify service SID is not valid (should start with "VA"). Falling back to auto-create.'
  );
}

const preferredServiceSid = isVerifyServiceSid(configuredServiceSid) ? configuredServiceSid : null;

let cachedServiceSid: string | null = preferredServiceSid;

const twilioBaseUrl = 'https://verify.twilio.com/v2';

type TwilioVerifyResponse = {
  sid: string;
  service_sid: string;
  to: string;
  status: string;
};

type TwilioErrorResponse = {
  message?: string;
  more_info?: string;
  code?: number;
};

const encodeCredentials = () => {
  if (!accountSid || !authToken) {
    throw new Error(
      'Missing Twilio credentials. Set EXPO_PUBLIC_TWILIO_ACCOUNT_SID and EXPO_PUBLIC_TWILIO_AUTH_TOKEN in your .env (or expo config).' +
        '\nIf you recently updated .env, restart Expo using "npx expo start -c" so the values are compiled into the bundle.'
    );
  }
  return `Basic ${base64Encode(`${accountSid}:${authToken}`)}`;
};

const toE164 = (value: string) => {
  const cleaned = value.trim();
  if (!cleaned) {
    throw new Error('Please enter a mobile number.');
  }

  const digitsWithPlus = cleaned.replace(/[^0-9+]/g, '');
  if (digitsWithPlus.startsWith('+')) {
    return digitsWithPlus;
  }

  let digitsOnly = cleaned.replace(/[^0-9]/g, '');

  if (digitsOnly.startsWith('0091')) {
    digitsOnly = digitsOnly.slice(4);
  } else if (digitsOnly.startsWith('91') && digitsOnly.length === 12) {
    digitsOnly = digitsOnly.slice(2);
  }

  digitsOnly = digitsOnly.replace(/^0+/, '');

  if (digitsOnly.length !== 10) {
    throw new Error('Please enter a valid 10-digit Indian mobile number.');
  }

  return `+91${digitsOnly}`;
};

const request = async (path: string, body: URLSearchParams) => {
  const response = await fetch(`${twilioBaseUrl}${path}`, {
    method: 'POST',
    headers: {
      Authorization: encodeCredentials(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    let detail: TwilioErrorResponse | undefined;
    try {
      detail = await response.json();
    } catch {
      // ignore
    }
    const messageDetail = detail?.more_info ? `${detail.more_info}` : '';
    const codeDetail = detail?.code ? ` (code ${detail.code})` : '';
    const message = [detail?.message ?? response.statusText, messageDetail].filter(Boolean).join(' ') + codeDetail;
    if (response.status === 401) {
      await AsyncStorage.removeItem(VERIFY_SERVICE_CACHE_KEY).catch(() => undefined);
      cachedServiceSid = preferredServiceSid;
      throw new Error(
        'Twilio authentication failed. Double-check EXPO_PUBLIC_TWILIO_ACCOUNT_SID / EXPO_PUBLIC_TWILIO_AUTH_TOKEN and restart the Expo dev server.'
      );
    }
    throw new Error(`Twilio request failed: ${message}`);
  }

  return (await response.json()) as TwilioVerifyResponse;
};

const ensureVerifyServiceSid = async () => {
  if (cachedServiceSid) {
    return cachedServiceSid;
  }
  const stored = await AsyncStorage.getItem(VERIFY_SERVICE_CACHE_KEY);
  if (stored && isVerifyServiceSid(stored)) {
    cachedServiceSid = stored;
    return stored;
  }
  if (stored && !isVerifyServiceSid(stored)) {
    await AsyncStorage.removeItem(VERIFY_SERVICE_CACHE_KEY).catch(() => undefined);
  }

  const params = new URLSearchParams({ FriendlyName: VERIFY_FRIENDLY_NAME });
  const response = await fetch(`${twilioBaseUrl}/Services`, {
    method: 'POST',
    headers: {
      Authorization: encodeCredentials(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    let detail: TwilioErrorResponse | undefined;
    try {
      detail = await response.json();
    } catch {
      // ignore
    }
    const message = detail?.message ?? response.statusText;
    throw new Error(`Unable to create Twilio Verify service: ${message}`);
  }

  const { sid } = (await response.json()) as { sid: string };
  await AsyncStorage.setItem(VERIFY_SERVICE_CACHE_KEY, sid);
  cachedServiceSid = sid;
  return sid;
};

export const twilioVerifyClient = {
  async sendVerification(phoneNumber: string) {
    const serviceSid = await ensureVerifyServiceSid();
    const params = new URLSearchParams({
      To: toE164(phoneNumber),
      Channel: 'sms',
    });
    return request(`/Services/${serviceSid}/Verifications`, params);
  },
  async checkVerification(phoneNumber: string, code: string) {
    const serviceSid = await ensureVerifyServiceSid();
    const params = new URLSearchParams({
      To: toE164(phoneNumber),
      Code: code,
    });
    const result = await request(`/Services/${serviceSid}/VerificationCheck`, params);
    return result.status === 'approved';
  },
};
