/**
 * pi-google-home — Google Home device control for Pi Coding Agent.
 *
 * Uses the Google Smart Device Management (SDM) API.
 * Required env vars:
 *   GOOGLE_HOME_PROJECT_ID   — SDM project ID (or set in settings)
 *   GOOGLE_HOME_ACCESS_TOKEN — OAuth access token (auto-refreshed if refresh token provided)
 *   GOOGLE_HOME_CLIENT_ID    — OAuth client ID (for auto-refresh)
 *   GOOGLE_HOME_CLIENT_SECRET — OAuth client secret (for auto-refresh)
 *   GOOGLE_HOME_REFRESH_TOKEN — OAuth refresh token (for auto-refresh)
 */

import { Type } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const BASE = "https://smartdevicemanagement.googleapis.com/v1";

interface EnvConfig {
  projectId: string;
  accessToken: string;
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
}

function getConfig(): EnvConfig | null {
  const projectId = process.env.GOOGLE_HOME_PROJECT_ID;
  const accessToken = process.env.GOOGLE_HOME_ACCESS_TOKEN;
  if (!projectId || !accessToken) return null;
  return {
    projectId,
    accessToken,
    clientId: process.env.GOOGLE_HOME_CLIENT_ID,
    clientSecret: process.env.GOOGLE_HOME_CLIENT_SECRET,
    refreshToken: process.env.GOOGLE_HOME_REFRESH_TOKEN,
  };
}

async function refreshAccessToken(config: EnvConfig): Promise<string> {
  if (!config.clientId || !config.clientSecret || !config.refreshToken) {
    return config.accessToken;
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token refresh failed: ${res.status} ${body}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

async function apiRequest(config: EnvConfig, path: string, options?: RequestInit): Promise<unknown> {
  let token = config.accessToken;
  // Try refresh first if credentials available
  if (config.clientId) {
    try {
      token = await refreshAccessToken(config);
    } catch {
      // Fall back to existing token
    }
  }
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`SDM API error ${res.status}: ${body}`);
  }
  // 204 = no content (success)
  if (res.status === 204) return { status: "success" };
  return res.json();
}

// ---------- tools ----------

const listDevicesTool = {
  name: "google_home_list_devices",
  label: "Google Home — List Devices",
  description: "List all Google Home / SDM-managed devices",
  parameters: Type.Object({}),

  async execute(_toolCallId, _params, signal) {
    const config = getConfig();
    if (!config) {
      return {
        content: [{ type: "text", text: "Error: Set GOOGLE_HOME_PROJECT_ID and GOOGLE_HOME_ACCESS_TOKEN env vars." }],
        details: { error: "missing config" },
        isError: true,
      };
    }
    const data = (await apiRequest(config, `/enterprises/${config.projectId}/devices`, { signal })) as {
      devices?: Array<{ name: string; type: string; traits: Record<string, unknown> }>;
    };
    const devices = data.devices ?? [];
    const lines = devices.map((d) => `- **${d.name}** (${d.type})\n  Traits: ${Object.keys(d.traits).join(", ")}`);
    const text = lines.length ? lines.join("\n") : "No devices found.";
    return { content: [{ type: "text", text }], details: { count: devices.length } };
  },
};

const executeCommandTool = {
  name: "google_home_execute_command",
  label: "Google Home — Execute Command",
  description: "Send a command to a Google Home device (on/off, brightness, thermostat mode, lock/unlock, etc.)",
  parameters: Type.Object({
    deviceId: Type.String({ description: "Device name or ID (e.g. 'Living Room Light')" }),
    command: Type.String({
      description:
        'Command in the form "trait.action(params)". Examples: "sdm.devices.commands.OnOff.SetOn(on=true)", "sdm.devices.commands.Brightness.SetBrightness(brightness=80)"',
    }),
  }),

  async execute(_toolCallId, params, signal) {
    const config = getConfig();
    if (!config) {
      return {
        content: [{ type: "text", text: "Error: Set GOOGLE_HOME_PROJECT_ID and GOOGLE_HOME_ACCESS_TOKEN env vars." }],
        details: { error: "missing config" },
        isError: true,
      };
    }

    // Resolve device name → full resource path
    const devicesData = (await apiRequest(config, `/enterprises/${config.projectId}/devices`, { signal })) as {
      devices?: Array<{ name: string; type: string }>;
    };
    const devices = devicesData.devices ?? [];
    const device =
      devices.find((d) => d.name.toLowerCase() === params.deviceId.toLowerCase()) ||
      devices.find((d) => d.name.includes(params.deviceId));
    if (!device) {
      return {
        content: [{ type: "text", text: `Device "${params.deviceId}" not found. Use google_home_list_devices to see available devices.` }],
        details: { error: "device not found" },
        isError: true,
      };
    }

    // Parse command: "sdm.devices.commands.OnOff.SetOn(on=true)"
    const cmdMatch = params.command.match(/^([^(]+)\(([^)]*)\)$/);
    if (!cmdMatch) {
      return {
        content: [{ type: "text", text: `Invalid command format. Use "trait.action(key=value)" syntax.` }],
        details: { error: "bad command format" },
        isError: true,
      };
    }
    const command = cmdMatch[1];
    const paramStr = cmdMatch[2];

    // Parse params: "on=true" → { on: true }
    const paramsObj: Record<string, unknown> = {};
    if (paramStr.trim()) {
      for (const part of paramStr.split(",")) {
        const [k, v] = part.split("=").map((s) => s.trim());
        if (k && v !== undefined) {
          paramsObj[k] = v === "true" ? true : v === "false" ? false : isNaN(Number(v)) ? v : Number(v);
        }
      }
    }

    const body = { command, params: paramsObj };
    const result = await apiRequest(config, `/${device.name}:executeCommand`, {
      signal,
      method: "POST",
      body: JSON.stringify(body),
    });

    return {
      content: [{ type: "text", text: `✅ Command sent to **${device.name}**\n\`${command}(${paramStr})\`\nResult: ${JSON.stringify(result)}` }],
      details: { device: device.name, command, params: paramsObj },
    };
  },
};

const getDeviceStateTool = {
  name: "google_home_get_state",
  label: "Google Home — Get Device State",
  description: "Get the current state/traits of a Google Home device",
  parameters: Type.Object({
    deviceId: Type.String({ description: "Device name or ID" }),
  }),

  async execute(_toolCallId, params, signal) {
    const config = getConfig();
    if (!config) {
      return {
        content: [{ type: "text", text: "Error: Set GOOGLE_HOME_PROJECT_ID and GOOGLE_HOME_ACCESS_TOKEN env vars." }],
        details: { error: "missing config" },
        isError: true,
      };
    }

    const devicesData = (await apiRequest(config, `/enterprises/${config.projectId}/devices`, { signal })) as {
      devices?: Array<{ name: string; type: string; traits: Record<string, unknown> }>;
    };
    const devices = devicesData.devices ?? [];
    const device =
      devices.find((d) => d.name.toLowerCase() === params.deviceId.toLowerCase()) ||
      devices.find((d) => d.name.includes(params.deviceId));
    if (!device) {
      return {
        content: [{ type: "text", text: `Device "${params.deviceId}" not found.` }],
        details: { error: "device not found" },
        isError: true,
      };
    }

    const text = `**${device.name}** (${device.type})\n\`\`\`json\n${JSON.stringify(device.traits, null, 2)}\n\`\`\``;
    return { content: [{ type: "text", text }], details: { device: device.name, traits: device.traits } };
  },
};

// ---------- extension ----------

export default function (pi: ExtensionAPI) {
  pi.registerTool(listDevicesTool);
  pi.registerTool(executeCommandTool);
  pi.registerTool(getDeviceStateTool);
}
