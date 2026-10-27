/*
 * This file is part of FlowAutomate.
 *
 * Copyright © 2026 midra001
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * FlowAutomate is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * FlowAutomate is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with FlowAutomate. If not, see <https://www.gnu.org/licenses/>.
 *
 * @author midra001
 * @since 2026-09-26
 */

import { executeGoogleNode, usesGoogleOAuth } from '../services/googleService.js';
function resolveGooglePrevious(value, input) {
  if (typeof value !== 'string') return value;
  return value.replace(/\{\{\s*prev\.output(?:\.([a-zA-Z0-9_.]+))?\s*\}\}/g, (_, path) => {
    const result = path ? path.split('.').reduce((current, key) => current?.[key], input) : input;
    return result === null || result === undefined ? '' : typeof result === 'object' ? JSON.stringify(result) : String(result);
  });
}
import { sendDiscordMessage } from '../services/discordService.js';
export async function executeNode(node, input) {
  if (usesGoogleOAuth(node)) {
    return { output: await executeGoogleNode(node, input, value => resolveGooglePrevious(value, input)) };
  }
  if (node.type === 'gmail_send') throw new Error('Legacy Apps Script Gmail nodes must run through WorkflowEngine, or switch this node to Google OAuth.');
  switch (node.type) {
    case 'manual_trigger': {
      return { output: { triggeredAt: new Date().toLocaleTimeString() } };
    }

    case 'battery_check': {
      let level = 85;
      if (typeof navigator !== 'undefined' && navigator.getBattery) {
        try {
          const battery = await navigator.getBattery();
          level = Math.round(battery.level * 100);
        } catch {
          level = 85;
        }
      }
      return { output: level };
    }

    case 'http_request': {
      const { method = 'GET', url } = node.config || {};
      if (!url) {
        throw new Error('HTTP Node has no URL configured');
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(url, {
        method,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}:${res.statusText}`);
      }

      const data = await res.json();
      return { output: data };
    }

    case 'gemini_extraction': {
      const apiKey = node.config?.apiKey || '';
      const customPrompt = node.config?.prompt || '';

      if (!apiKey) throw new Error('Missing Gemini API Key in node configuration.');
      if (!customPrompt) throw new Error('Missing Extraction Prompt in node configuration.');

      let rawText = '';
      if (typeof input === 'string') {
        rawText = input;
      } else if (input && input.extractedText) {
        rawText = input.extractedText;
      } else {
        rawText = JSON.stringify(input);
      }

      if (!rawText || rawText.trim() === '{}') {
        throw new Error('No valid text received from the previous node to process.');
      }

      const finalPrompt = `${customPrompt}\n\nHere is the raw document text:\n${rawText}\n\nReturn ONLY a valid JSON array. Do not include any markdown formatting like \`\`\`json.`;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: finalPrompt }] }]
        })
      });

      const data = await response.json();
      
      if (data.error) {
        throw new Error(`Gemini API Error: ${data.error.message}`);
      }

      const textResponse = data.candidates[0].content.parts[0].text;
      const cleanJsonStr = textResponse.replace(/```json/gi, '').replace(/```/g, '').trim();

      let parsedJson;
      try {
        parsedJson = JSON.parse(cleanJsonStr);
      } catch (e) {
        throw new Error(`Failed to parse AI response as JSON. Raw output: ${textResponse}`);
      }
      
      return { output: parsedJson };
    }

    case 'json_transform': {
      const path = node.config?.path;
      if (!path) return { output: input };

      const val = path.split('.').reduce((acc, part) => acc?.[part], input);
      if (val === undefined) {
        throw new Error(`Path '${path}' returned undefined`);
      }
      return { output: val };
    }

    case 'if_condition': {
      const { operator = '>', compareValue = 0 } = node.config || {};
      let passed = false;
      const numInput = Number(input);
      const numComp = Number(compareValue);

      if (operator === '>') passed = numInput > numComp;
      else if (operator === '<') passed = numInput < numComp;
      else if (operator === '==') passed = String(input) === String(compareValue);
      else if (operator === '!=') passed = String(input) !== String(compareValue);

      return {
        output: input,
        branch: passed ? 'true' : 'false',
        passed,
      };
    }

    case 'notification': {
      const message = (node.config?.message || 'Workflow action triggered').replace(
        '{{prev.output}}',
        typeof input === 'object' ? JSON.stringify(input) : String(input)
      );
      return { output: message };
    }

    case 'discord_action': {
      const config = node.config || {};
      const messageContent = (config.message || '').replaceAll(
        '{{prev.output}}', typeof input === 'object' ? JSON.stringify(input, null, 2) : String(input ?? '')
      );
      const payload = {
        action: config.action || 'send_channel_message',
        targetId: config.targetId || '', messageContent,
      };
      if (config.attachData) {
        const fileStr = typeof input === 'object' ? JSON.stringify(input, null, 2) : String(input ?? '');
        payload.fileName = config.fileName || 'workflow_output.json';
        if (typeof Buffer !== 'undefined') payload.fileContent = Buffer.from(fileStr, 'utf8').toString('base64');
        else {
          let binary = '';
          for (const byte of new TextEncoder().encode(fileStr)) binary += String.fromCharCode(byte);
          payload.fileContent = btoa(binary);
        }
      }
      return { output: await sendDiscordMessage(config, payload) };
    }

    default:
      return { output: input };
  }
}