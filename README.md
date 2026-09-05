# pi-google-home

[Pi Coding Agent](https://github.com/earendil-works/pi-coding-agent) extension for controlling Google Home devices via the [Smart Device Management (SDM) API](https://developers.google.com/nest/device-access).

## Features

Three tools available to the agent:

| Tool | Description |
|------|-------------|
| `google_home_list_devices` | List all registered devices and their traits |
| `google_home_execute_command` | Send commands (on/off, brightness, lock, thermostat, etc.) |
| `google_home_get_state` | Get current device state and trait data |

## Setup

### 1. Enable the SDM API

1. Go to [Google Nest Device Access Console](https://console.nest.google.com/device-access/)
2. Create a project and note the **Project ID**
3. Enable the **Smart Device Management API**
4. Create OAuth 2.0 credentials (Client ID + Client Secret)
5. Complete the OAuth flow to get a **Refresh Token**

### 2. Install

```bash
cd ~/.pi/agent/extensions
git clone https://github.com/tkoyama010/pi-google-home.git
cd pi-google-home && npm install
```

### 3. Configure

Set these environment variables (e.g. in `~/.zshrc` or `~/.bashrc`):

```bash
export GOOGLE_HOME_PROJECT_ID="your-project-id"
export GOOGLE_HOME_ACCESS_TOKEN="initial-access-token"       # can be temporary if using refresh
export GOOGLE_HOME_CLIENT_ID="your-oauth-client-id"          # for auto-refresh
export GOOGLE_HOME_CLIENT_SECRET="your-oauth-client-secret"  # for auto-refresh
export GOOGLE_HOME_REFRESH_TOKEN="your-refresh-token"        # for auto-refresh
```

Then restart pi or run `/reload`.

## Usage Examples

Once loaded, the agent can use these tools naturally:

```
> List my Google Home devices
  → calls google_home_list_devices

> Turn off the living room light
  → calls google_home_execute_command(deviceId="Living Room Light", command="sdm.devices.commands.OnOff.SetOn(on=false)")

> What's the bedroom thermostat set to?
  → calls google_home_get_state(deviceId="Bedroom Thermostat")
```

## Supported Commands

The extension passes commands directly to the SDM API, so all [SDM command traits](https://developers.google.com/nest/device-access/device-types) are supported:

| Trait | Command | Example |
|-------|---------|---------|
| OnOff | `SetOn` | `sdm.devices.commands.OnOff.SetOn(on=true)` |
| Brightness | `SetBrightness` | `sdm.devices.commands.Brightness.SetBrightness(brightness=80)` |
| ColorTemperature | `SetColorTemperature` | `sdm.devices.commands.ColorTemperature.SetColorTemperature(colorTemperatureK=4000)` |
| ThermostatMode | `SetMode` | `sdm.devices.commands.ThermostatMode.SetMode(mode="COOL")` |
| ThermostatTemperatureSetpoint | `SetHeat` / `SetCool` | `sdm.devices.commands.ThermostatTemperatureSetpoint.SetHeat(heatCelsius=22)` |
| LockUnlock | `Lock` / `Unlock` | `sdm.devices.commands.LockUnlock.Lock` |
| FanSpeed | `SetSpeed` | `sdm.devices.commands.FanSpeed.SetSpeed(fanSpeedPercent=50)` |

## License

MIT
