import GoogleNodeFields from '../components/GoogleNodeFields';
// src/screens/NodeConfigScreen.js
// Restyled to match the FlowAutomate landing / home / history screens:
//  - near-black background, purple header glow, logo nav bar
//  - rounded black form card, dark inputs with a purple focus border
//  - pill option buttons, white primary Save button
// Includes merged Gemini AI Extraction and Discord Action node configuration.
// Requires: react-native-svg

import React, { useState, useLayoutEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  ScrollView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';

/* ───────────────────────── tokens (shared with the other screens) ───────────────────────── */
const C = {
  bg: '#0B0B0C',
  cardBg: '#000000',
  line: '#232327',
  lineSoft: '#2C2C31',
  cardBorder: '#4A4A50',
  text: '#FFFFFF',
  muted: '#B4B4BC',
  label: '#8C8C94',
  purple: '#A855F7',
  hover: '#8000FF',
  code: '#A7F3D0',
};
const SANS = Platform.select({
  web: 'Inter, "Helvetica Neue", Arial, sans-serif',
  default: undefined,
});
const MONO = Platform.select({
  web: '"SF Mono", Menlo, Consolas, "Courier New", monospace',
  default: 'monospace',
});

const OPERATORS = ['==', '!=', '>', '<', 'contains', 'not_contains'];

const DEFAULT_CSV = `Client Name, Email, Item, Amount
Wayne Enterprises, bruce@waynecorp.com, Security Suite, 12500.00
Stark Industries, tony@stark.com, Arc Reactor Parts, 84200.00
Acme Corp, coyote@acme.com, Rocket Launcher, 350.50
Cyberdyne Systems, miles@cyberdyne.com, Neural Processor, 4999.00`;

const DEFAULT_JS_CODE = `return items.map(user => {
  const digits = (user.phone || '').replace(/\\D/g, '');
  return {
    name: user.name,
    phone: digits.length === 10 ? \`+1\${digits}\` : null,
    status: digits.length === 10 ? 'normalized' : 'invalid'
  };
});`;


/* ───────────────────────── icons ───────────────────────── */
function Logo({ size = 28 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <Path d="M6 20 C6 10 14 18 22 8" stroke="#fff" strokeWidth={3.2} strokeLinecap="round" />
      <Circle cx={6} cy={20} r={4} fill="#fff" />
      <Circle cx={22} cy={8} r={4} fill="#fff" />
    </Svg>
  );
}

function BackIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <Path d="M15 5l-7 7 7 7" stroke="#fff" strokeWidth={2} />
    </Svg>
  );
}

/* ───────────────────────── form pieces ───────────────────────── */
// Labelled text field. kind: 'input' | 'multiline' | 'code'
function Field({ label, hint, kind = 'input', first, style, ...inputProps }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={first ? null : s.fieldGap}>
      <Text style={s.label}>{label}</Text>
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
      <TextInput
        {...inputProps}
        placeholderTextColor={C.label}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          s.input,
          kind === 'multiline' && s.multiline,
          kind === 'code' && s.codeEditor,
          style,
          focused && { borderColor: C.purple },
        ]}
      />
    </View>
  );
}

// Pill option button (operators, Yes / No)
function OptionPill({ label, active, onPress }) {
  return (
    <TouchableOpacity style={[s.opBtn, active && s.opBtnActive]} onPress={onPress} activeOpacity={0.7}>
      <Text style={[s.opBtnText, active && s.opBtnTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function InfoBox({ children }) {
  return (
    <View style={s.infoBox}>
      <View style={s.infoDot} />
      <Text style={s.infoText}>{children}</Text>
    </View>
  );
}

function ActionButton({ onPress, solid, children }) {
  const [hover, setHover] = useState(false);
  const bg = solid ? (hover ? C.hover : '#fff') : hover ? '#fff' : 'transparent';
  const border = solid ? (hover ? C.hover : '#fff') : '#fff';
  const fg = solid ? (hover ? '#fff' : '#000') : hover ? '#000' : '#fff';
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      style={[s.actionBtn, { backgroundColor: bg, borderColor: border }]}
    >
      <Text style={[s.actionBtnText, { color: fg }]}>{children}</Text>
    </Pressable>
  );
}

/* ───────────────────────── screen ───────────────────────── */
export default function NodeConfigScreen({ route, navigation }) {
  const { node, onSave } = route.params;
  const { width } = useWindowDimensions();
  const padX = width < 640 ? 20 : 28;

  // Hide the navigator's default header (this screen draws its own)
  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const [config, setConfig] = useState(() => {
    const existing = { ...(node.config || {}) };
    if (node.type === 'discord_trigger' || node.type === 'discord_action') delete existing.botToken;
    if (node.type === 'javascript_code' && existing.code === undefined) {
      return { ...existing, code: DEFAULT_JS_CODE };
    }
    if (node.type === 'wait_for_approval') {
      return {
        prompt: 'Manager approval required for expense',
        approverEmail: 'manager@company.com',
        ...existing,
      };
    }
    if (node.type === 'csv_to_json' && existing.csvText === undefined) {
      return { ...existing, csvText: DEFAULT_CSV };
    }
    return existing;
  });

  const set = (key) => (t) => setConfig((prev) => ({ ...prev, [key]: t }));

  const handleSave = () => {
    const savedConfig = { ...(node.config || {}), ...config };
    if (node.type === 'discord_trigger' || node.type === 'discord_action') delete savedConfig.botToken;
    onSave({ ...node, config: savedConfig });
    navigation.goBack();
  };

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={{ paddingBottom: 60 }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* header region with the landing-page purple glow */}
      <View style={s.headerWrap}>
        {Platform.OS === 'web' && (
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundImage:
                  'radial-gradient(ellipse 55% 140% at 0% 0%, rgba(88,28,135,0.55), rgba(11,11,12,0) 70%)',
              },
            ]}
          />
        )}

        <View style={[s.nav, { paddingHorizontal: padX }]}>
          <TouchableOpacity style={s.row} onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <BackIcon />
            <View style={{ width: 14 }} />
            <Logo />
            <Text style={s.brand}>FlowAutomate</Text>
          </TouchableOpacity>
        </View>

        <View style={[s.titleBlock, { paddingHorizontal: padX }]}>
          <Text style={s.eyebrow}>CONFIGURE NODE</Text>
          <Text style={[s.title, width < 640 && { fontSize: 34 }]}>{node.label}</Text>
        </View>
      </View>

      {/* form card */}
      <View style={[s.card, { marginHorizontal: padX }]}>
        {/* Inbound Email Listener */}
        {node.type === 'inbound_email' && (
          <Field
            first
            label="Apps Script Listener URL"
            hint="The workflow will poll this URL every 3 seconds for up to 60 seconds waiting for an email."
            value={config.webhookUrl || ''}
            onChangeText={set('webhookUrl')}
            placeholder="https://script.google.com/macros/s/..."
          />
        )}

        {/* Gemini AI Extraction Node */}
        {node.type === 'gemini_extraction' && (
          <>
            <Field
              first
              label="Gemini API Key"
              hint="Securely inject your Google AI Studio key here."
              value={config.apiKey || ''}
              onChangeText={set('apiKey')}
              placeholder="AIzaSy..."
              secureTextEntry={true}
            />
            <Field
              kind="multiline"
              label="Extraction Prompt / Instructions"
              hint="Tell the AI exactly what to pull from the unstructured text. It will automatically return a JSON array based on these rules."
              multiline
              numberOfLines={6}
              style={{ minHeight: 140 }}
              value={config.prompt || ''}
              onChangeText={set('prompt')}
              placeholder="e.g. Extract the candidate's Name, Email, Role, and Years of Experience from this resume text."
            />
          </>
        )}

        {/* Parse CSV Table */}
        {node.type === 'csv_to_json' && (
          <Field
            first
            kind="multiline"
            label="CSV Content (Header row + data rows)"
            hint="Comma-separated table. The first row defines the keys for each object."
            multiline
            numberOfLines={8}
            value={config.csvText || ''}
            onChangeText={set('csvText')}
          />
        )}

        {/* Bulk Invoice Looper */}
        {node.type === 'loop_invoice_generator' && (
          <InfoBox>
            This node loops sequentially over each row object received from the CSV parser step, compiles an itemized
            invoice, and dispatches mock customer notifications.
          </InfoBox>
        )}

        {/* Wait for Approval Node */}
        {node.type === 'wait_for_approval' && (
          <>
            <Field
              first
              label="Prompt Message"
              hint="The message displayed to the approver when execution pauses."
              value={config.prompt || ''}
              onChangeText={set('prompt')}
              placeholder="e.g. Please approve expense report {{step1.output.expenseId}}"
            />
            <Field
              label="Approver Email / User ID"
              value={config.approverEmail || ''}
              onChangeText={set('approverEmail')}
              placeholder="manager@company.com"
            />
          </>
        )}

        {/* JavaScript Code Node */}
        {node.type === 'javascript_code' && (
          <Field
            first
            kind="code"
            label="JavaScript Transformation Code"
            hint={
              <>
                Variables available: <Text style={s.codeTag}>input</Text> (previous node output),{' '}
                <Text style={s.codeTag}>items</Text> (input wrapped as array), and{' '}
                <Text style={s.codeTag}>steps</Text> (object of all step outputs).
              </>
            }
            multiline
            numberOfLines={12}
            autoCapitalize="none"
            autoCorrect={false}
            value={config.code ?? ''}
            onChangeText={set('code')}
          />
        )}

        {/* HTTP Request */}
        {node.type === 'http_request' && (
          <>
            <Field
              first
              label="Endpoint URL"
              value={config.url || ''}
              onChangeText={set('url')}
              placeholder="https://..."
            />
            <Field
              label="HTTP Method"
              value={config.method || 'GET'}
              onChangeText={(t) => setConfig((prev) => ({ ...prev, method: t.toUpperCase() }))}
              placeholder="GET, POST, PUT, DELETE"
            />
            <Field
              kind="multiline"
              label="Body (JSON string, optional)"
              multiline
              numberOfLines={4}
              value={config.body || ''}
              onChangeText={set('body')}
              placeholder='{"key": "value"}'
            />
          </>
        )}

        {/* JSON Transform */}
        {node.type === 'json_transform' && (
          <Field
            first
            label="JSON Key Path (e.g. data.amount)"
            value={config.path || ''}
            onChangeText={set('path')}
            placeholder="current.temperature_2m"
          />
        )}

        {/* Timer / Schedule */}
        {node.type === 'timer_trigger' && (
          <Field
            first
            label="Delay / Interval (Seconds)"
            value={String(config.delaySeconds || '2')}
            onChangeText={set('delaySeconds')}
            keyboardType="numeric"
          />
        )}

        {/* Local Storage */}
        {node.type === 'local_storage' && (
          <>
            <Field
              first
              label="Operation (SET or GET)"
              value={config.operation || 'SET'}
              onChangeText={(t) => setConfig((prev) => ({ ...prev, operation: t.toUpperCase() }))}
              placeholder="SET or GET"
            />
            <Field
              label="Storage Key Name"
              value={config.key || 'my_storage_key'}
              onChangeText={set('key')}
              placeholder="key_name"
            />
            <Field
              label="Value to Store (if SET)"
              value={config.value || ''}
              onChangeText={set('value')}
              placeholder="Leave blank to use previous node output"
            />
          </>
        )}

        {/* Set Data / Transform */}
        {node.type === 'set_data' && (
          <Field
            first
            kind="multiline"
            label="Custom JSON Object"
            multiline
            numberOfLines={4}
            value={config.jsonData || '{\n  "customKey": "testValue"\n}'}
            onChangeText={set('jsonData')}
            placeholder='{"key": "value"}'
          />
        )}

        {/* IF Condition */}
        {node.type === 'if_condition' && (
          <>
            <Field
              first
              label="Object Key to Check (Optional, e.g. priority or user.status)"
              value={config.field || ''}
              onChangeText={set('field')}
              placeholder="Leave blank to inspect raw previous output"
            />

            <View style={s.fieldGap}>
              <Text style={s.label}>Condition Operator</Text>
              <View style={s.opRow}>
                {OPERATORS.map((op) => (
                  <OptionPill
                    key={op}
                    label={op}
                    active={(config.operator || '==') === op}
                    onPress={() => setConfig((prev) => ({ ...prev, operator: op }))}
                  />
                ))}
              </View>
            </View>

            <Field
              label="Compare Value"
              value={String(config.compareValue ?? '')}
              onChangeText={set('compareValue')}
              placeholder="e.g. Urgent, 25, or true"
            />
          </>
        )}

        {/* Notification */}
        {node.type === 'notification' && (
          <>
            <Field
              first
              label="Notification Title"
              value={config.title || 'Workflow Alert'}
              onChangeText={set('title')}
              placeholder="Title"
            />
            <Field
              label="Message"
              value={config.message || 'Result is {{prev.output}}'}
              onChangeText={set('message')}
              placeholder="e.g. {{step1.output.priority}}: {{step2.output}}"
            />
          </>
        )}

        {/* Google Workspace integrations */}
        {['gmail_send', 'gmail_read', 'google_sheets', 'google_drive'].includes(node.type) && (
          <GoogleNodeFields type={node.type} config={config} setConfig={setConfig} />
        )}

        {/* Discord Action */}
        {node.type === 'discord_action' && (
          <>
            <Field
              first
              label="Discord Backend URL"
              hint="Bot token is configured only in the backend .env. Use your PC's LAN address when testing on a phone."
              value={config.backendUrl || ''}
              onChangeText={set('backendUrl')}
              placeholder="http://localhost:3000"
            />

            <View style={s.fieldGap}>
              <Text style={s.label}>Action Event</Text>
              <View style={s.opRow}>
                <OptionPill
                  label="Send Channel Message"
                  active={(config.action || 'send_channel_message') === 'send_channel_message'}
                  onPress={() => setConfig((prev) => ({ ...prev, action: 'send_channel_message' }))}
                />
                <OptionPill
                  label="Send Direct Message"
                  active={config.action === 'send_direct_message'}
                  onPress={() => setConfig((prev) => ({ ...prev, action: 'send_direct_message' }))}
                />
              </View>
            </View>

            <Field
              label={config.action === 'send_direct_message' ? "User ID" : "Channel ID"}
              hint="Right-click a user or channel in Discord with Developer Mode ON to copy ID."
              value={config.targetId || ''}
              onChangeText={set('targetId')}
              placeholder="e.g., 104538421948320"
            />

            <Field
              kind="multiline"
              label="Message Content"
              multiline
              numberOfLines={4}
              value={config.message || ''}
              onChangeText={set('message')}
              placeholder="Hello from FlowAutomate! Data: {{prev.output}}"
            />

            <View style={s.fieldGap}>
              <Text style={s.label}>Attach Workflow Data as File?</Text>
              <View style={s.opRow}>
                <OptionPill
                  label="Yes"
                  active={!!config.attachData}
                  onPress={() => setConfig((prev) => ({ ...prev, attachData: true }))}
                />
                <OptionPill
                  label="No"
                  active={!config.attachData}
                  onPress={() => setConfig((prev) => ({ ...prev, attachData: false }))}
                />
              </View>
            </View>

            {config.attachData && (
              <Field
                label="Attachment File Name"
                value={config.fileName || 'workflow_output.json'}
                onChangeText={set('fileName')}
                placeholder="output.json"
              />
            )}
          </>
        )}

        {/* Discord Trigger */}
        {node.type === 'discord_trigger' && (
          <>
            <Field
              first
              label="Discord Backend URL"
              hint="Bot token is configured only in the backend .env. Use your PC's LAN address when testing on a phone."
              value={config.backendUrl || ''}
              onChangeText={set('backendUrl')}
              placeholder="http://localhost:3000"
            />
            <Field
              label="Channel ID to Listen"
              hint="Start the workflow, wait for Listening, then post a NEW message or file in this channel."
              value={config.channelId || ''}
              onChangeText={set('channelId')}
              placeholder="e.g., 104538421948320"
            />
            <View style={s.fieldGap}>
              <Text style={s.label}>Listen For</Text>
              <View style={s.opRow}>
                <OptionPill label="File Uploads" active={(config.eventMode || 'attachment') === 'attachment'}
                  onPress={() => setConfig(prev => ({ ...prev, eventMode: 'attachment' }))} />
                <OptionPill label="Messages & Files" active={config.eventMode === 'message'}
                  onPress={() => setConfig(prev => ({ ...prev, eventMode: 'message' }))} />
              </View>
            </View>
            <Field label="Wait Timeout (seconds)" hint="10–600 seconds. The listener ends after one matching event."
              value={String(config.timeoutSeconds || 120)} onChangeText={set('timeoutSeconds')} placeholder="120" />
          </>
        )}

        {/* WhatsApp Action */}
        {node.type === 'whatsapp_send' && (
          <>
            <Field
              first
              label="Meta Access Token"
              hint="Requires a permanent or temporary token from the Meta Developer Portal."
              value={config.token || ''}
              onChangeText={set('token')}
              placeholder="EAA..."
              secureTextEntry
            />
            <Field
              label="Phone Number ID"
              hint="The ID of your registered WhatsApp business number."
              value={config.phoneId || ''}
              onChangeText={set('phoneId')}
              placeholder="e.g. 104538421948320"
            />
            <Field
              label="Recipient Phone Number"
              hint="Include the country code. Do not use plus (+) or dashes. (e.g., 15551234567)"
              value={config.to || ''}
              onChangeText={set('to')}
              placeholder="15551234567"
            />
            <Field
              kind="multiline"
              label="Message Content"
              multiline
              numberOfLines={4}
              value={config.message || ''}
              onChangeText={set('message')}
              placeholder="Hello! Here is the output: {{prev.output}}"
            />
          </>
        )}

        {/* Informational only nodes */}
        {(node.type === 'battery_sensor' ||
          node.type === 'network_status' ||
          node.type === 'device_info' ||
          node.type === 'manual_trigger') && (
          <InfoBox>This node reads live system data automatically. No manual configuration required!</InfoBox>
        )}

        <View style={s.actions}>
          <ActionButton onPress={() => navigation.goBack()}>Cancel</ActionButton>
          <ActionButton solid onPress={handleSave}>
            Save Configuration
          </ActionButton>
        </View>
      </View>
    </ScrollView>
  );
}

/* ───────────────────────── styles ───────────────────────── */
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  row: { flexDirection: 'row', alignItems: 'center' },

  headerWrap: { position: 'relative', overflow: 'hidden' },
  nav: {
    height: 84,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  brand: { color: '#fff', fontSize: 28, fontWeight: '500', fontFamily: SANS, marginLeft: 10, letterSpacing: -0.5 },

  titleBlock: { paddingTop: 36, paddingBottom: 32 },
  eyebrow: { color: C.purple, fontSize: 12, letterSpacing: 1.4, fontFamily: MONO, marginBottom: 10 },
  title: { color: C.text, fontSize: 48, fontWeight: '300', fontFamily: SANS, letterSpacing: -1.5 },

  card: {
    backgroundColor: C.cardBg,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: C.cardBorder,
    padding: 28,
    maxWidth: 760,
    width: 'auto',
    alignSelf: 'stretch',
    marginTop: 8,
  },

  fieldGap: { marginTop: 22 },
  label: { color: C.text, fontSize: 14, fontWeight: '500', fontFamily: SANS, marginBottom: 6 },
  hint: { color: C.label, fontSize: 13, lineHeight: 19, fontFamily: SANS, marginBottom: 10 },
  codeTag: { color: C.purple, fontFamily: MONO, fontWeight: '600' },

  input: {
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.lineSoft,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: C.text,
    fontSize: 15,
    fontFamily: SANS,
    ...Platform.select({ web: { outlineStyle: 'none' }, default: {} }),
  },
  multiline: { minHeight: 110, fontFamily: MONO, fontSize: 13, textAlignVertical: 'top' },
  codeEditor: {
    minHeight: 220,
    fontFamily: MONO,
    fontSize: 13,
    lineHeight: 20,
    textAlignVertical: 'top',
    color: C.code,
    backgroundColor: '#000',
  },

  opRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  opBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  opBtnActive: { backgroundColor: '#fff', borderColor: '#fff' },
  opBtnText: { color: C.muted, fontSize: 14, fontFamily: SANS },
  opBtnTextActive: { color: '#000' },

  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderWidth: 1,
    borderColor: C.lineSoft,
    borderRadius: 14,
    padding: 16,
  },
  infoDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.purple, marginTop: 7 },
  infoText: { flex: 1, color: C.muted, fontSize: 15, lineHeight: 22, fontFamily: SANS },

  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 14, marginTop: 32, flexWrap: 'wrap' },
  actionBtn: { height: 48, paddingHorizontal: 24, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  actionBtnText: { fontSize: 16, fontFamily: SANS },
});