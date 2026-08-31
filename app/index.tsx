import { AudioModule, RecordingPresets, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type Recipient = 'self' | 'child';
type Screen = 'setup' | 'context' | 'recording' | 'analyzing' | 'results';
type PatientType = 'adult' | 'child';
type DurationUnit = 'hours' | 'days';

interface ExtractedData {
  patient_type: PatientType;
  symptoms: string;
  duration: number;
  duration_unit: DurationUnit;
  temperature: number | null;
  medications: string | null;
  age: number | null;
}

const EXTRACTION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    patient_type: { type: 'string', enum: ['adult', 'child'] },
    symptoms: { type: 'string' },
    duration: { type: 'number' },
    duration_unit: { type: 'string', enum: ['hours', 'days'] },
    temperature: { type: ['number', 'null'] },
    medications: { type: ['string', 'null'] },
    age: { type: ['number', 'null'] },
  },
  required: ['patient_type', 'symptoms', 'duration', 'duration_unit', 'temperature', 'medications', 'age'],
  additionalProperties: false,
} as const;

function validateExtractedData(value: unknown): ExtractedData {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Nieprawidłowy format danych zwróconych przez model.');
  }
  const v = value as Record<string, unknown>;
  if (v.patient_type !== 'adult' && v.patient_type !== 'child') {
    throw new Error('Nieprawidłowa wartość patient_type.');
  }
  if (typeof v.symptoms !== 'string') {
    throw new Error('Nieprawidłowa wartość symptoms.');
  }
  if (typeof v.duration !== 'number') {
    throw new Error('Nieprawidłowa wartość duration.');
  }
  if (v.duration_unit !== 'hours' && v.duration_unit !== 'days') {
    throw new Error('Nieprawidłowa wartość duration_unit.');
  }
  if (v.temperature !== null && typeof v.temperature !== 'number') {
    throw new Error('Nieprawidłowa wartość temperature.');
  }
  if (v.medications !== null && typeof v.medications !== 'string') {
    throw new Error('Nieprawidłowa wartość medications.');
  }
  if (v.age !== null && typeof v.age !== 'number') {
    throw new Error('Nieprawidłowa wartość age.');
  }
  return {
    patient_type: v.patient_type,
    symptoms: v.symptoms,
    duration: v.duration,
    duration_unit: v.duration_unit,
    temperature: v.temperature as number | null,
    medications: v.medications as string | null,
    age: v.age as number | null,
  };
}

const FIELD_KEYS = ['symptoms', 'duration', 'temperature', 'medications', 'age'] as const;
type FieldKey = (typeof FIELD_KEYS)[number];

const FIELD_LABELS: Record<FieldKey, string> = {
  symptoms: 'Objawy',
  duration: 'Czas trwania',
  temperature: 'Temperatura',
  medications: 'Przyjęte leki',
  age: 'Wiek',
};

const PROMPT_ITEMS: Record<Recipient, Record<FieldKey, string>> = {
  self: {
    symptoms: 'Jakie masz objawy?',
    duration: 'Od kiedy to trwa?',
    temperature: 'Czy masz podwyższoną temperaturę?',
    medications: 'Czy zażyłeś/aś już jakieś leki?',
    age: 'Ile masz lat?',
  },
  child: {
    symptoms: 'Jakie objawy ma dziecko?',
    duration: 'Od kiedy to trwa?',
    temperature: 'Czy dziecko ma podwyższoną temperaturę?',
    medications: 'Czy dziecko zażyło już jakieś leki?',
    age: 'Ile lat ma dziecko?',
  },
};

const RECORDING_TITLES: Record<Recipient, string> = {
  self: 'Opisz swoje objawy',
  child: 'Opisz objawy dziecka',
};

// duration/duration_unit are non-nullable in the schema (see extractFields), so an
// unspoken duration comes back as the sentinel 0/"days" rather than null.
function isFieldMissing(result: ExtractedData, field: FieldKey): boolean {
  switch (field) {
    case 'symptoms':
      return !result.symptoms;
    case 'duration':
      return result.duration === 0;
    case 'temperature':
      return result.temperature == null;
    case 'medications':
      return !result.medications;
    case 'age':
      return result.age == null;
  }
}

function formatFieldValue(result: ExtractedData, field: FieldKey): string | null {
  switch (field) {
    case 'symptoms':
      return result.symptoms || null;
    case 'duration':
      return isFieldMissing(result, 'duration')
        ? null
        : `${result.duration} ${result.duration_unit === 'hours' ? 'godz.' : 'dni'}`;
    case 'temperature':
      return result.temperature != null ? `${result.temperature}°C` : null;
    case 'medications':
      return result.medications;
    case 'age':
      return result.age != null ? `${result.age} lat` : null;
  }
}

// Keeps every already-captured field; only fills in what the previous recording(s) missed.
function mergeExtractedData(previous: ExtractedData, incoming: ExtractedData): ExtractedData {
  return {
    patient_type: previous.patient_type,
    symptoms: previous.symptoms || incoming.symptoms,
    duration: isFieldMissing(previous, 'duration') ? incoming.duration : previous.duration,
    duration_unit: isFieldMissing(previous, 'duration') ? incoming.duration_unit : previous.duration_unit,
    temperature: previous.temperature ?? incoming.temperature,
    medications: previous.medications ?? incoming.medications,
    age: previous.age ?? incoming.age,
  };
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

async function transcribeAudio(uri: string, apiKey: string): Promise<string> {
  const formData = new FormData();
  formData.append('model_id', 'scribe_v1');
  formData.append('file', {
    uri,
    name: 'recording.m4a',
    type: 'audio/m4a',
  } as unknown as Blob);

  const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': apiKey },
    body: formData,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Błąd transkrypcji (ElevenLabs, ${response.status}): ${body.slice(0, 200)}`);
  }

  const data = (await response.json()) as { text?: string };
  if (!data.text) {
    throw new Error('Transkrypcja nie zwróciła żadnego tekstu. Spróbuj nagrać ponownie.');
  }
  return data.text;
}

async function extractFields(
  transcriptText: string,
  recipient: Recipient,
  apiKey: string
): Promise<ExtractedData> {
  const patientType: PatientType = recipient === 'self' ? 'adult' : 'child';
  const recipientContext =
    recipient === 'self'
      ? 'Nagranie dotyczy dorosłego pacjenta mówiącego o sobie.'
      : 'Nagranie dotyczy rodzica lub opiekuna opisującego objawy swojego dziecka.';

  const systemPrompt = `Jesteś asystentem wywiadu przedkonsultacyjnego w telemedycynie. Wyodrębnij z transkrypcji wypowiedzi pacjenta dokładnie te informacje: objawy, czas trwania dolegliwości, temperaturę ciała (jeśli wspomniana), przyjęte leki (jeśli wspomniane) oraz wiek. ${recipientContext} Pole "patient_type" musi mieć dokładnie wartość "${patientType}". Nie stawiaj diagnozy ani nie udzielaj porad medycznych — wyodrębniaj wyłącznie informacje, które faktycznie padły w wypowiedzi, zachowując ich oryginalne znaczenie (nie interpretuj medycznie objawów ani nazw leków). Nie wymyślaj informacji, których nie było w nagraniu: dla temperature, medications i age użyj null, jeśli nie zostały wspomniane. Normalizuj wartości liczbowe rozsądnie na podstawie sensu wypowiedzi, np. "trzydzieści osiem i pół stopnia" → temperature: 38.5, "dziewięć lat" → age: 9, "od wczoraj" → duration: 1, duration_unit: "days". Pole "symptoms" powinno zawierać objawy oddzielone przecinkami, a "medications" leki oddzielone przecinkami. Rozróżniaj brak informacji od wyraźnej odpowiedzi przeczącej: jeśli pacjent w ogóle nie wspomniał o lekach, ustaw "medications" na null; jeśli pacjent wyraźnie powiedział, że nie zażywał żadnych leków (np. "nie brałem żadnych leków"), ustaw "medications" dokładnie na "nie". Jeśli czas trwania nie został w ogóle wspomniany, jako jedyny wyjątek od zakazu wymyślania podaj najbardziej zachowawcze przybliżenie: duration: 0, duration_unit: "days".`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'intake_extraction',
          strict: true,
          schema: EXTRACTION_JSON_SCHEMA,
        },
      },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: transcriptText },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Błąd wyodrębniania danych (OpenAI, ${response.status}): ${body.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI nie zwróciło żadnej odpowiedzi.');
  }

  return validateExtractedData(JSON.parse(content));
}

export default function VoiceIntakeScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const tint = Colors[colorScheme].tint;

  const [screen, setScreen] = useState<Screen>('setup');
  const [elevenLabsKey, setElevenLabsKey] = useState('');
  const [openAiKey, setOpenAiKey] = useState('');
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [transcript, setTranscript] = useState('');
  const [analyzingStage, setAnalyzingStage] = useState<'transcribing' | 'extracting'>('transcribing');
  const [result, setResult] = useState<ExtractedData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);

  const canContinueSetup = elevenLabsKey.trim().length > 0 && openAiKey.trim().length > 0;

  const handleSelectRecipient = (r: Recipient) => {
    setRecipient(r);
    setScreen('recording');
  };

  const handleStartRecording = async () => {
    setError(null);
    const status = await AudioModule.requestRecordingPermissionsAsync();
    if (!status.granted) {
      Alert.alert(
        'Brak dostępu do mikrofonu',
        'Aby nagrać opis objawów, zezwól aplikacji na dostęp do mikrofonu w ustawieniach systemowych.'
      );
      return;
    }
    await audioRecorder.prepareToRecordAsync();
    audioRecorder.record();
  };

  const runAnalysis = async (uri: string) => {
    if (!recipient) return;
    try {
      setAnalyzingStage('transcribing');
      const text = await transcribeAudio(uri, elevenLabsKey.trim());
      setTranscript((prev) => (prev ? `${prev}\n\n— Dodatkowe nagranie —\n${text}` : text));
      setAnalyzingStage('extracting');
      const extracted = await extractFields(text, recipient, openAiKey.trim());
      setResult((prev) => (prev ? mergeExtractedData(prev, extracted) : extracted));
      setScreen('results');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Wystąpił nieoczekiwany błąd.');
      setScreen('recording');
    }
  };

  const handleStopRecording = async () => {
    await audioRecorder.stop();
    const uri = audioRecorder.uri;
    if (!uri) {
      setError('Nie udało się zapisać nagrania. Spróbuj ponownie.');
      return;
    }
    setScreen('analyzing');
    void runAnalysis(uri);
  };

  const handleRecordAgain = () => {
    setResult(null);
    setTranscript('');
    setError(null);
    setScreen('recording');
  };

  const handleSupplementRecording = () => {
    setError(null);
    setScreen('recording');
  };

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ThemedView style={styles.flex}>
        {screen === 'setup' && (
          <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
              <ThemedText type="title">Klucze API</ThemedText>
              <ThemedText style={styles.subtitle}>
                Klucze są używane wyłącznie w tej sesji i nie są nigdzie zapisywane.
              </ThemedText>

              <ThemedText style={styles.label}>Klucz API ElevenLabs</ThemedText>
              <TextInput
                style={[styles.input, { borderColor: tint }]}
                value={elevenLabsKey}
                onChangeText={setElevenLabsKey}
                placeholder="sk_..."
                placeholderTextColor="#9BA1A6"
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
              />

              <ThemedText style={styles.label}>Klucz API OpenAI</ThemedText>
              <TextInput
                style={[styles.input, { borderColor: tint }]}
                value={openAiKey}
                onChangeText={setOpenAiKey}
                placeholder="sk-..."
                placeholderTextColor="#9BA1A6"
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
              />

              <Pressable
                style={[styles.primaryButton, { backgroundColor: tint, opacity: canContinueSetup ? 1 : 0.4 }]}
                disabled={!canContinueSetup}
                onPress={() => setScreen('context')}>
                <ThemedText style={styles.primaryButtonText}>Dalej</ThemedText>
              </Pressable>
            </ScrollView>
          </KeyboardAvoidingView>
        )}

        {screen === 'context' && (
          <View style={styles.container}>
            <ThemedText type="title">Dla kogo będzie teleporada?</ThemedText>
            <Pressable
              style={[styles.bigButton, { backgroundColor: tint }]}
              onPress={() => handleSelectRecipient('self')}>
              <ThemedText style={styles.bigButtonText}>Dla mnie</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.bigButton, { backgroundColor: tint }]}
              onPress={() => handleSelectRecipient('child')}>
              <ThemedText style={styles.bigButtonText}>Dla dziecka</ThemedText>
            </Pressable>
          </View>
        )}

        {screen === 'recording' && recipient && (
          <View style={styles.container}>
            <ThemedText type="title">
              {result ? 'Uzupełnij brakujące informacje' : RECORDING_TITLES[recipient]}
            </ThemedText>
            <ThemedText style={styles.subtitle}>Postaraj się wspomnieć o:</ThemedText>
            {(result ? FIELD_KEYS.filter((field) => isFieldMissing(result, field)) : FIELD_KEYS).map((field) => (
              <ThemedText key={field} style={styles.promptItem}>
                {'•'} {PROMPT_ITEMS[recipient][field]}
              </ThemedText>
            ))}

            {error && (
              <ThemedView style={styles.errorBox}>
                <ThemedText style={styles.errorText}>{error}</ThemedText>
              </ThemedView>
            )}

            {recorderState.isRecording && (
              <ThemedText style={styles.recordingIndicator}>
                {'●'} Nagrywanie... {formatDuration(recorderState.durationMillis ?? 0)}
              </ThemedText>
            )}

            <Pressable
              style={[
                styles.bigButton,
                { backgroundColor: recorderState.isRecording ? '#D9534F' : tint },
              ]}
              onPress={recorderState.isRecording ? handleStopRecording : handleStartRecording}>
              <ThemedText style={styles.bigButtonText}>
                {recorderState.isRecording ? 'Zakończ nagrywanie' : 'Rozpocznij nagrywanie'}
              </ThemedText>
            </Pressable>
          </View>
        )}

        {screen === 'analyzing' && (
          <View style={[styles.container, styles.centered]}>
            <ActivityIndicator size="large" color={tint} />
            <ThemedText style={styles.subtitle}>
              {analyzingStage === 'transcribing' ? 'Przetwarzam nagranie...' : 'Wyodrębniam informacje...'}
            </ThemedText>
          </View>
        )}

        {screen === 'results' && result && (
          <ScrollView contentContainerStyle={styles.container}>
            <ThemedText type="title">Podsumowanie wywiadu</ThemedText>

            {FIELD_KEYS.map((field) => {
              const missing = isFieldMissing(result, field);
              return (
                <View key={field} style={styles.checklistRow}>
                  <ThemedText style={missing ? styles.checklistIconMissing : styles.checklistIconDone}>
                    {missing ? '✗' : '✓'}
                  </ThemedText>
                  <View style={styles.checklistTextWrap}>
                    <ThemedText style={styles.checklistLabel}>{FIELD_LABELS[field]}</ThemedText>
                    <ThemedText style={missing ? styles.checklistValueMissing : styles.checklistValue}>
                      {formatFieldValue(result, field) ?? 'Brak informacji'}
                    </ThemedText>
                  </View>
                </View>
              );
            })}

            <ThemedText style={styles.label}>Transkrypcja</ThemedText>
            <ThemedView style={styles.transcriptBox}>
              <ThemedText>{transcript}</ThemedText>
            </ThemedView>

            <Pressable style={[styles.primaryButton, { backgroundColor: tint }]} onPress={handleRecordAgain}>
              <ThemedText style={styles.primaryButtonText}>Nagraj całość ponownie</ThemedText>
            </Pressable>

            {FIELD_KEYS.some((field) => isFieldMissing(result, field)) && (
              <Pressable
                style={[styles.secondaryButton, { borderColor: tint }]}
                onPress={handleSupplementRecording}>
                <ThemedText style={[styles.secondaryButtonText, { color: tint }]}>
                  Dograj brakujące informacje
                </ThemedText>
              </Pressable>
            )}

            {/* Dev-only: remove before shipping to patients */}
            <ThemedText style={styles.label}>DEBUG — Structured extraction</ThemedText>
            <ThemedView style={styles.transcriptBox}>
              <ThemedText style={styles.debugText}>{JSON.stringify(result, null, 2)}</ThemedText>
            </ThemedView>
          </ScrollView>
        )}
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    padding: 24,
    gap: 12,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  subtitle: {
    fontSize: 16,
    opacity: 0.7,
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
  },
  primaryButton: {
    marginTop: 20,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    paddingVertical: 16,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  bigButton: {
    marginTop: 12,
    borderRadius: 16,
    paddingVertical: 28,
    alignItems: 'center',
  },
  bigButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  promptItem: {
    fontSize: 16,
    marginTop: 4,
  },
  recordingIndicator: {
    marginTop: 16,
    fontSize: 16,
    color: '#D9534F',
    textAlign: 'center',
  },
  errorBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D9534F',
  },
  errorText: {
    color: '#D9534F',
  },
  checklistRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 8,
  },
  checklistIconDone: {
    fontSize: 20,
    color: '#3C9D57',
    width: 24,
  },
  checklistIconMissing: {
    fontSize: 20,
    color: '#D9534F',
    width: 24,
  },
  checklistTextWrap: {
    flex: 1,
  },
  checklistLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  checklistValue: {
    fontSize: 16,
  },
  checklistValueMissing: {
    fontSize: 16,
    fontStyle: 'italic',
    opacity: 0.7,
  },
  transcriptBox: {
    marginTop: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#9BA1A6',
  },
  debugText: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 12,
  },
});
