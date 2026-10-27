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

import { executeGoogleNode } from '../services/googleService.js';
import { sendDiscordMessage, waitForDiscordEvent } from '../services/discordService.js';
// src/engine/WorkflowEngine.js

function getNestedValue(obj, path) {
  if (!obj || !path) return obj;
  return path
    .split('.')
    .reduce((acc, part) => (acc !== undefined && acc !== null ? acc[part] : undefined), obj);
}

function cleanString(val) {
  if (val === null || val === undefined) return '';
  let str = String(val).trim();
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    str = str.slice(1, -1).trim();
  }
  return str.toLowerCase();
}

function resolveInterpolation(templateStr, stepOutputs, previousOutput) {
  if (typeof templateStr !== 'string') return templateStr;

  let resolved = templateStr.replace(
    /\{\{\s*step_?(\d+)\.output(?:\.([a-zA-Z0-9_.]+))?\s*\}\}/g,
    (_, stepIdx, path) => {
      const rawStepOutput = stepOutputs[Number(stepIdx)];
      const val = path ? getNestedValue(rawStepOutput, path) : rawStepOutput;
      return val !== undefined && val !== null
        ? typeof val === 'object'
          ? JSON.stringify(val)
          : String(val)
        : '';
    }
  );

  resolved = resolved.replace(
    /\{\{\s*prev\.output(?:\.([a-zA-Z0-9_.]+))?\s*\}\}/g,
    (_, path) => {
      const val = path ? getNestedValue(previousOutput, path) : previousOutput;
      return val !== undefined && val !== null
        ? typeof val === 'object'
          ? JSON.stringify(val)
          : String(val)
        : '';
    }
  );

  return resolved;
}

export async function runWorkflow(nodes, onStepUpdate, resumeContext = null) {
  const executionLogs = resumeContext ? [...resumeContext.logs] : [];
  const stepOutputs = resumeContext ? { ...resumeContext.stepOutputs } : {};
  const nodeOutputs = resumeContext ? { ...resumeContext.nodeOutputs } : {};
  const nodeStatus = resumeContext ? { ...resumeContext.nodeStatus } : {};

  const startIndex = resumeContext ? resumeContext.resumeIndex : 0;

  for (let i = startIndex; i < nodes.length; i++) {
    const node = nodes[i];
    const stepNumber = i + 1;

    let effectiveParentId = node.parentId;
    if (effectiveParentId === undefined && i > 0) {
      if (node.targetBranch) {
        for (let prev = i - 1; prev >= 0; prev--) {
          if (nodes[prev].targetBranch === node.targetBranch || nodes[prev].type === 'if_condition') {
            effectiveParentId = nodes[prev].id;
            break;
          }
        }
      } else {
        effectiveParentId = nodes[i - 1].id;
      }
    }
    const parentNode = effectiveParentId ? nodes.find((n) => n.id === effectiveParentId) : null;

    let isSkipped = false;
    let skipReason = '';

    if (effectiveParentId) {
      if (nodeStatus[effectiveParentId] === 'skipped') {
        isSkipped = true;
        skipReason = `Skipped: Parent path is inactive`;
      } else if (parentNode && parentNode.type === 'if_condition' && node.targetBranch) {
        const conditionResult = nodeOutputs[effectiveParentId]?.__conditionResult;
        const branchTaken = conditionResult ? 'true' : 'false';
        if (node.targetBranch !== branchTaken) {
          isSkipped = true;
          skipReason = `Skipped: on ${node.targetBranch.toUpperCase()} branch (Condition was${branchTaken.toUpperCase()})`;
        }
      }
    }

    if (isSkipped) {
      nodeStatus[node.id] = 'skipped';
      if (onStepUpdate) onStepUpdate(node.id, 'skipped', skipReason);
      executionLogs.push({
        nodeId: node.id,
        nodeLabel: node.label,
        status: 'skipped',
        output: skipReason,
      });
      continue;
    }

    nodeStatus[node.id] = 'active';

    let activeInput = null;
    if (effectiveParentId && nodeOutputs[effectiveParentId] !== undefined) {
      const parentOut = nodeOutputs[effectiveParentId];
      if (parentOut && typeof parentOut === 'object' && '__conditionResult' in parentOut) {
        activeInput = parentOut.payload;
      } else {
        activeInput = parentOut;
      }
    }

    if (onStepUpdate) onStepUpdate(node.id, 'running');

    try {
      let executionOutput = null;
      let internalOutput = null;

      switch (node.type) {
        case 'manual_trigger':
          executionOutput = { triggeredAt: new Date().toLocaleTimeString() };
          internalOutput = executionOutput;
          break;

        case 'timer_trigger': {
          const delaySec = Number(node.config?.delaySeconds || 2);
          await new Promise((resolve) => setTimeout(resolve, delaySec * 1000));
          executionOutput = {
            scheduledAt: new Date().toLocaleTimeString(),
            delaySeconds: delaySec,
            message: `Triggered after ${delaySec}s delay`,
          };
          internalOutput = executionOutput;
          break;
        }
        
        case 'inbound_email': {
          const webhookUrl = node.config?.webhookUrl || '';
          if (!webhookUrl) throw new Error('Missing Listener Webhook URL');

          let maxAttempts = 20; // 60 seconds total (3s * 20)
          let foundData = null;

          for (let attempt = 0; attempt < maxAttempts; attempt++) {
            if (onStepUpdate) {
              onStepUpdate(node.id, 'running', { 
                status: 'Polling...', 
                attempt: `${attempt + 1}/${maxAttempts}`,
                message: 'Waiting for inbound email with subject "PROCESS DEMO"...' 
              });
            }

            const response = await fetch(webhookUrl);
            const data = await response.json();

            if (data.status === 'success') {
              foundData = data;
              break;
            }

            // Wait 3 seconds before next poll
            await new Promise(resolve => setTimeout(resolve, 3000));
          }

          if (!foundData) {
            throw new Error('Timeout: No email received within 60 seconds. Try sending the email first, then click Test.');
          }

          let decodedText = '';
          
          // Check if the webhook returned pre-extracted text (from our updated Drive OCR webhook)
          if (foundData.extractedText) {
            decodedText = foundData.extractedText;
            executionOutput = {
              sender: foundData.sender,
              subject: foundData.subject,
              fileName: foundData.fileName,
              extractedText: decodedText,
              message: "Document text successfully extracted."
            };
            internalOutput = executionOutput; 
            break;
          }

          // Fallback to legacy CSV decoding if using the old webhook response structure
          try {
            if (typeof window !== 'undefined' && window.atob) {
              decodedText = decodeURIComponent(escape(window.atob(foundData.fileContentBase64)));
            } else if (typeof Buffer !== 'undefined') {
              decodedText = Buffer.from(foundData.fileContentBase64, 'base64').toString('utf8');
            } else {
              decodedText = decodeURIComponent(escape(atob(foundData.fileContentBase64)));
            }
          } catch(e) {
            throw new Error('Failed to decode file attachment. Ensure you attached a valid CSV file.');
          }

          const lines = decodedText.trim().split(/\r?\n/).filter((line) => line.trim().length > 0);
          if (lines.length < 2) {
             throw new Error('CSV attachment is empty or missing headers.');
          }
          
          const headers = lines[0].split(',').map((h) => h.trim());
          const parsedData = lines.slice(1).map((line) => {
            const values = line.split(',').map((v) => v.trim());
            const row = {};
            headers.forEach((h, idx) => {
              row[h] = values[idx] !== undefined ? values[idx] : null;
            });
            return row;
          });

          executionOutput = {
            sender: foundData.sender,
            subject: foundData.subject,
            fileName: foundData.fileName,
            parsedRows: parsedData.length,
            dataPreview: parsedData.slice(0, 2)
          };
          
          // Pass the array of parsed objects down the wire so Loops and JS Nodes can process it
          internalOutput = parsedData; 
          break;
        }

        case 'gemini_extraction': {
          const apiKey = node.config?.apiKey || '';
          const customPrompt = resolveInterpolation(node.config?.prompt || '', stepOutputs, activeInput);

          if (!apiKey) throw new Error('Missing Gemini API Key in node configuration.');
          if (!customPrompt) throw new Error('Missing Extraction Prompt in node configuration.');

          const parts = [];
          const finalPrompt = `${customPrompt}\n\nReturn ONLY a valid JSON array. Do not include any markdown formatting like \`\`\`json.`;

          // If the previous node (like Discord Trigger) gave us a file URL, download it
          if (activeInput && activeInput.fileUrl) {
            if (onStepUpdate) {
              onStepUpdate(node.id, 'running', { message: 'Downloading file for AI extraction...' });
            }

            const fileRes = await fetch(activeInput.fileUrl);
            if (!fileRes.ok) throw new Error(`Failed to download file: ${fileRes.status}`);
            
            const arrayBuffer = await fileRes.arrayBuffer();
            
            // Convert downloaded file to Base64
            let base64Data = '';
            if (typeof window !== 'undefined' && window.btoa) {
              const uint8Array = new Uint8Array(arrayBuffer);
              const chunkSize = 8192;
              for (let i = 0; i < uint8Array.length; i += chunkSize) {
                base64Data += String.fromCharCode.apply(null, uint8Array.subarray(i, i + chunkSize));
              }
              base64Data = window.btoa(base64Data);
            } else if (typeof Buffer !== 'undefined') {
              base64Data = Buffer.from(arrayBuffer).toString('base64');
            }

            // Guess mime type from Discord's fileName (default to text/plain)
            const fileName = (activeInput.fileName || '').toLowerCase();
            let mimeType = 'text/plain';
            if (fileName.endsWith('.pdf')) mimeType = 'application/pdf';
            else if (fileName.endsWith('.csv')) mimeType = 'text/csv';

            // Send the actual file to Gemini
            parts.push({ inlineData: { mimeType, data: base64Data } });
            parts.push({ text: finalPrompt });

          } else {
            // Fallback: If no file URL, just process the raw text like it used to
            let rawText = '';
            if (typeof activeInput === 'string') {
              rawText = activeInput;
            } else if (activeInput && activeInput.extractedText) {
              rawText = activeInput.extractedText;
            } else {
              rawText = JSON.stringify(activeInput);
            }

            if (!rawText || rawText.trim() === '{}') {
              throw new Error('No valid text or file received from the previous node.');
            }
            parts.push({ text: `Here is the raw document text:\n${rawText}\n\n${finalPrompt}` });
          }

          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts }] })
          });

          const data = await response.json();
          
          if (data.error) throw new Error(`Gemini API Error: ${data.error.message}`);

          const candidateParts = data.candidates?.[0]?.content?.parts || [];
          const textResponse = candidateParts.filter(part => !part.thought && typeof part.text === 'string').map(part => part.text).join('');
          if (!textResponse) throw new Error(`Gemini returned no text. ${data.promptFeedback?.blockReason ? 'Blocked: ' + data.promptFeedback.blockReason : (data.candidates?.[0]?.finishReason ? 'Finish reason: ' + data.candidates[0].finishReason : '')}`.trim());
          const cleanJsonStr = textResponse.replace(/```json/gi, '').replace(/```/g, '').trim();

          try {
            executionOutput = JSON.parse(cleanJsonStr);
          } catch (e) {
            throw new Error(`Failed to parse AI response as JSON. Raw output: ${textResponse}`);
          }
          
          internalOutput = executionOutput;
          break;
        }

        case 'javascript_code': {
          const userCode = node.config?.code || 'return input;';
          const runner = new Function('input', 'steps', 'items', `"use strict";\n${userCode}`);
          const itemsArray = Array.isArray(activeInput) ? activeInput : [activeInput];
          executionOutput = runner(activeInput, stepOutputs, itemsArray);
          internalOutput = executionOutput;
          break;
        }

        case 'wait_for_approval': {
          if (!resumeContext || resumeContext.resumeIndex !== i) {
            executionOutput = {
              status: 'waiting_for_approval',
              prompt: resolveInterpolation(node.config?.prompt || 'Manager approval required', stepOutputs, activeInput),
              approver: resolveInterpolation(node.config?.approverEmail || 'manager@company.com', stepOutputs, activeInput),
            };

            if (onStepUpdate) onStepUpdate(node.id, 'waiting', executionOutput);
            executionLogs.push({
              nodeId: node.id,
              nodeLabel: node.label,
              status: 'waiting',
              output: executionOutput,
            });

            return {
              status: 'suspended',
              suspendedAtNodeId: node.id,
              snapshot: {
                resumeIndex: i,
                stepOutputs,
                nodeOutputs,
                nodeStatus,
                logs: executionLogs,
              },
            };
          }
          executionOutput = resumeContext.decisionPayload;
          internalOutput = executionOutput;
          break;
        }

        case 'csv_to_json': {
          const rawCsv = resolveInterpolation(node.config?.csvText || '', stepOutputs, activeInput);
          if (!rawCsv) {
            executionOutput = [];
            break;
          }
          const lines = rawCsv.trim().split(/\r?\n/).filter((line) => line.trim().length > 0);
          if (lines.length < 2) {
            executionOutput = [];
            break;
          }
          const headers = lines[0].split(',').map((h) => h.trim());
          executionOutput = lines.slice(1).map((line) => {
            const values = line.split(',').map((v) => v.trim());
            const row = {};
            headers.forEach((h, idx) => {
              row[h] = values[idx] !== undefined ? values[idx] : null;
            });
            return row;
          });
          internalOutput = executionOutput;
          break;
        }

        case 'loop_invoice_generator': {
          const items = Array.isArray(activeInput) ? activeInput : [];
          const generatedInvoices = items.map((row, idx) => {
            const invoiceNumber = `INV-${2026001 + idx}`;
            const clientName = row['Client Name'] || row.clientName || 'Valued Customer';
            const email = row['Email'] || row.email || 'customer@example.com';
            const item = row['Item'] || row.item || 'General Service';
            const amount = row['Amount'] || row.amount || '0.00';

            const invoiceBody = `INVOICE: ${invoiceNumber}\nTo: ${clientName} (${email})\nItem: ${item}\nTotal Due: $${amount}\nStatus: PENDING`;
            return {
              invoiceNumber,
              clientName,
              email,
              item,
              amount,
              invoiceText: invoiceBody,
              emailSentMock: true,
              sentAt: new Date().toLocaleTimeString(),
            };
          });

          executionOutput = {
            totalRowsProcessed: generatedInvoices.length,
            invoices: generatedInvoices,
          };
          internalOutput = executionOutput;
          break;
        }

        case 'set_data': {
          try {
            executionOutput = node.config?.jsonData
              ? JSON.parse(node.config.jsonData)
              : { customValue: node.config?.value || 'Default Value' };
          } catch {
            executionOutput = { customValue: node.config?.value || 'Default Value' };
          }
          internalOutput = executionOutput;
          break;
        }

        case 'http_request': {
          const method = node.config?.method || 'GET';
          const url = resolveInterpolation(node.config?.url || '', stepOutputs, activeInput);
          if (!url) throw new Error('No URL specified');

          let requestBody = undefined;
          if (node.config?.body && (method === 'POST' || method === 'PUT')) {
            requestBody = resolveInterpolation(node.config.body, stepOutputs, activeInput);
          }

          const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: requestBody,
          });

          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          executionOutput = await response.json();
          internalOutput = executionOutput;
          break;
        }

        case 'local_storage': {
          const op = node.config?.operation || 'SET';
          const rawKey = node.config?.key || 'flow_data';
          const key = resolveInterpolation(rawKey, stepOutputs, activeInput);

          let storedValue;
          if (node.config?.value !== undefined && node.config?.value !== null && node.config?.value !== '') {
            storedValue = resolveInterpolation(String(node.config.value), stepOutputs, activeInput);
          } else {
            storedValue = typeof activeInput === 'object' ? JSON.stringify(activeInput) : String(activeInput);
          }

          if (op === 'SET') {
            if (typeof window !== 'undefined' && window.localStorage) {
              window.localStorage.setItem(key, storedValue);
            }
            executionOutput = { operation: 'SET', key, storedValue };
          } else {
            const retrieved =
              typeof window !== 'undefined' && window.localStorage
                ? window.localStorage.getItem(key)
                : null;
            executionOutput = { operation: 'GET', key, retrievedValue: retrieved };
          }
          internalOutput = executionOutput;
          break;
        }

        case 'if_condition': {
          const op = node.config?.operator || '==';
          const fieldKey = (node.config?.field || node.config?.variable || node.config?.key || '').trim();

          let leftVal = activeInput;

          if (fieldKey) {
            if (fieldKey.includes('{{')) {
              leftVal = resolveInterpolation(fieldKey, stepOutputs, activeInput);
            } else if (typeof activeInput === 'object' && activeInput !== null) {
              leftVal = getNestedValue(activeInput, fieldKey);
              if (leftVal === undefined && stepOutputs[1]) {
                leftVal = getNestedValue(stepOutputs[1], fieldKey);
              }
            }
          }

          let rightVal = node.config?.compareValue ?? '';
          if (typeof rightVal === 'string' && rightVal.includes('{{')) {
            rightVal = resolveInterpolation(rightVal, stepOutputs, activeInput);
          }

          let pass = false;
          const strLeft = cleanString(leftVal);
          const strRight = cleanString(rightVal);

          if (op === '==') pass = strLeft === strRight;
          else if (op === '!=') pass = strLeft !== strRight;
          else if (op === '>') pass = Number(leftVal) > Number(rightVal);
          else if (op === '<') pass = Number(leftVal) < Number(rightVal);
          else if (op === 'contains') pass = strLeft.includes(strRight);
          else if (op === 'not_contains') pass = !strLeft.includes(strRight);

          executionOutput = pass;
          internalOutput = { payload: activeInput, __conditionResult: pass };
          break;
        }

        case 'notification': {
          let message = resolveInterpolation(
            node.config?.message || 'Automation triggered!',
            stepOutputs,
            activeInput
          );
          let title = resolveInterpolation(
            node.config?.title || 'FlowAutomate Alert',
            stepOutputs,
            activeInput
          );

          if (typeof window !== 'undefined' && 'Notification' in window) {
            if (Notification.permission === 'granted') {
              new Notification(title, { body: message });
            } else if (Notification.permission !== 'denied') {
              Notification.requestPermission().then((permission) => {
                if (permission === 'granted') {
                  new Notification(title, { body: message });
                }
              });
            }
          }

          executionOutput = message;
          internalOutput = executionOutput;
          break;
        }

        case 'gmail_read':
        case 'google_sheets':
        case 'google_drive': {
          executionOutput = await executeGoogleNode(node, activeInput, value => resolveInterpolation(value, stepOutputs, activeInput));
          internalOutput = executionOutput;
          break;
        }

        case 'gmail_send': {
          const legacy = node.config?.googleProvider === 'legacy' || (node.config?.webhookUrl && !node.config?.googleProvider);
          if (!legacy) {
            executionOutput = await executeGoogleNode(node, activeInput, value => resolveInterpolation(value, stepOutputs, activeInput));
            internalOutput = executionOutput;
            break;
          }
          const to = resolveInterpolation(node.config?.to || '', stepOutputs, activeInput);
          const subject = resolveInterpolation(node.config?.subject || '', stepOutputs, activeInput);
          const body = resolveInterpolation(node.config?.body || '', stepOutputs, activeInput);
          const webhookUrl = node.config?.webhookUrl || ''; 

          if (!webhookUrl) throw new Error('Missing Webhook URL in node config');
          if (!to) throw new Error('Missing recipient email');

          const payload = { to, subject, body };

          if (node.config?.attachData) {
            const fileStr = typeof activeInput === 'object' 
              ? JSON.stringify(activeInput, null, 2) 
              : String(activeInput ?? '');
            
            payload.fileName = node.config?.fileName || 'workflow_output.json';
            payload.mimeType = typeof activeInput === 'object' ? 'application/json' : 'text/plain';
            
            let encodedString = '';
            try {
              if (typeof window !== 'undefined' && window.btoa) {
                encodedString = window.btoa(unescape(encodeURIComponent(fileStr)));
              } else if (typeof Buffer !== 'undefined') {
                encodedString = Buffer.from(fileStr, 'utf8').toString('base64');
              } else {
                encodedString = btoa(unescape(encodeURIComponent(fileStr)));
              }
            } catch (e) {
              console.warn('Base64 encoding error:', e);
            }
            
            payload.fileContent = encodedString;
          }

          const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload),
          });

          if (!response.ok) throw new Error(`Gmail Webhook Failed: ${response.status}`);
          
          executionOutput = await response.json();
          internalOutput = executionOutput;
          break;
        }

        case 'discord_action': {
          const action = node.config?.action || 'send_channel_message';
          const targetId = String(resolveInterpolation(node.config?.targetId || '', stepOutputs, activeInput)).trim();
          const messageContent = resolveInterpolation(node.config?.message || '', stepOutputs, activeInput);
          const payload = { action, targetId, messageContent };
          if (node.config?.attachData) {
            const fileStr = typeof activeInput === 'object'
              ? JSON.stringify(activeInput, null, 2) : String(activeInput ?? '');
            payload.fileName = node.config?.fileName || 'workflow_output.json';
            if (typeof Buffer !== 'undefined') {
              payload.fileContent = Buffer.from(fileStr, 'utf8').toString('base64');
            } else {
              const bytes = new TextEncoder().encode(fileStr);
              let binary = '';
              for (const byte of bytes) binary += String.fromCharCode(byte);
              payload.fileContent = btoa(binary);
            }
          }
          executionOutput = await sendDiscordMessage(node.config || {}, payload);
          internalOutput = executionOutput;
          break;
        }

        case 'discord_trigger': {
          executionOutput = await waitForDiscordEvent(node.config || {}, progress => {
            if (onStepUpdate) onStepUpdate(node.id, 'running', progress);
          });
          internalOutput = executionOutput;
          break;
        }

        case 'whatsapp_send': {
          const phoneId = resolveInterpolation(node.config?.phoneId || '', stepOutputs, activeInput);
          const token = resolveInterpolation(node.config?.token || '', stepOutputs, activeInput);
          const toPhone = resolveInterpolation(node.config?.to || '', stepOutputs, activeInput);
          const message = resolveInterpolation(node.config?.message || '', stepOutputs, activeInput);
          
          if (!phoneId || !token || !toPhone || !message) {
            throw new Error('Missing required WhatsApp configuration fields.');
          }

          const res = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
            method: 'POST',
            headers: { 
              'Authorization': `Bearer ${token}`, 
              'Content-Type': 'application/json' 
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: toPhone,
              type: 'text',
              text: { body: message }
            })
          });
          
          const data = await res.json();
          
          if (!res.ok) {
            const errorMsg = data.error?.message || JSON.stringify(data);
            throw new Error(`WhatsApp API Failed (${res.status}): ${errorMsg}`);
          }
          
          executionOutput = data;
          internalOutput = executionOutput;
          break;
        }

        default:
          executionOutput = activeInput;
          internalOutput = executionOutput;
      }

      stepOutputs[stepNumber] = executionOutput;
      nodeOutputs[node.id] = internalOutput;

      if (onStepUpdate) onStepUpdate(node.id, 'success', executionOutput);
      executionLogs.push({
        nodeId: node.id,
        nodeLabel: node.label,
        status: 'success',
        output: executionOutput,
      });
    } catch (err) {
      if (onStepUpdate) onStepUpdate(node.id, 'failed', null, err.message);
      executionLogs.push({
        nodeId: node.id,
        nodeLabel: node.label,
        status: 'failed',
        error: err.message,
      });
      break;
    }
  }

  const overallSuccess = executionLogs.every(
    (l) => l.status === 'success' || l.status === 'skipped'
  );
  return {
    status: overallSuccess ? 'success' : 'failed',
    logs: executionLogs,
  };
}