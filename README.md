# S2KAISDisplay

A read-only Signal K display for **own-vessel AIS data**, with vessel/voyage and
dynamic-data screens. It also supplies a Freeboard-SK extension side panel.

**Not a certified AIS display.** Signal K may not receive all of the messages,
fields or hardware status shown on the transceiver. The plugin can decode
raw own-vessel AIS reports but cannot independently verify radio transmission.
Do not use it as the sole source for navigation or safety decisions.

The package and plugin identifier remain `signalk-s2k-display` after the
repository and display-name change.

## Installation

This project is not yet published on npm. Download the installable `.tgz`
archive from [GitHub Releases](https://github.com/acfischer42/S2KAISDisplay/releases),
copy it to the Signal K server and install it from the Signal K configuration
directory. Alternatively, build the archive from source with `npm pack`.

```sh
cd /data/conf/signalk
npm install /path/to/signalk-s2k-display-0.1.1.tgz
```

Restart Signal K and enable **S2KAISDisplay** under **Plugin Config**. In the
plugin settings add the exact AIS `$source` identifier(s) visible in the Signal
K Data Browser (for example `my-ais.AIVDO`; your actual identifier will differ).
In Signal K mode no data is shown until at least one source is configured.
Direct readback mode instead needs the dedicated input event described below.
Select only sources
that you know carry your own transceiver's reports. Do not select output from
an AIS generator if the intention is to inspect the actual hardware.

Open **Webapps → S2KAISDisplay**. In Freeboard-SK, use the extension toolbar
button for the **AIS display** side panel. This needs a Freeboard version
supporting `plotterExtensions` iframe panels, and a Signal K server supporting
resource providers. Older installations may still use the standalone webapp.
The panel provider is registered again after each plugin restart or settings
save. Reload Freeboard after enabling the plugin to refresh extension discovery.

## Data and limitations

With direct readback disabled, the plugin subscribes to `vessels.self` updates from all sources and retains
only configured source identifiers. It does not use the server's selected
value as a substitute for an AIS value. It displays the latest matching delta
per field; a value's source and timestamp appear as a tooltip. The footer shows
the latest received timestamp, not proof of AIS transmission. Dynamic fields
older than three minutes are marked **outdated**. The server connection status
is not an AIS health indicator.

Signal K must decode and associate own-ship AIS reports with `vessels.self`;
some AIS installations do not expose own-ship reports to Signal K at all.
After a plugin restart the screen waits for new matching updates. Static and
voyage messages can take several minutes to arrive. If another device or
plugin publishes using the same source identifier, it cannot be distinguished.
Fields not provided by those updates are shown as **Not available**; position
accuracy, RAIM and internal/external GNSS are not inferred from other fields. Existing AIS
equipment settings cannot be edited from this display.

### Direct own-vessel AIS readback

Enable **Read own-vessel AIS reports directly** and configure the **AIS input
sentence event** from the AIS connection (for example `ais-voyage-in`). This
uses the same dedicated input event as SignalK2AIS, without opening the serial
device or transmitting anything. It must carry actual device input, never a
global or output event. Type 5 is normally sent by Class A transceivers;
Class B type 24 is not decoded here.

This mode uses only raw input, not Signal K deltas or settings, including
before the first report arrives. Existing configurations with `aisReadback`
enabled now also use raw dynamic data; there is no Signal K fallback.

Complete, checksum-validated `!AIVDO` type 5 reports supply identity,
voyage, ship type and antenna dimension fields. Types 1, 2 and 3 (Class A)
and 18 and 19 (Class B) supply position, speed, course, heading, position
accuracy, RAIM and the reported UTC second/status. Class A also supplies
navigation status and rate of turn; Class B does not, so those fields are
unavailable on Class B reports. Type 19 static fields and type 27 long-range
reports are not decoded. Other-vessel `AIVDM` reports are ignored.

Unavailable sentinel values clear the corresponding reading. Missing fields
remain unavailable rather than being replaced with Signal K settings. The
receive time and input event appear in the field tooltip; after 30 minutes the
type 5 values are marked outdated. Dynamic values are marked outdated after
three minutes, including navigation status on the vessel screen.
Voyage and dynamic reports update their respective fields without erasing
each other. Data is held only in memory and requires new reports after restart.
Speed at the AIS upper limit is shown as a lower bound. Rate-of-turn direction
codes without a turn indicator are shown as such, not as measured turn rates.

AIS type 5 ETA contains month, day, hour and minute, **not a year**. Raw
readback displays those fields without inventing a year. Signal K's decoded ETA
may include an inferred year; verify it against the AIS equipment.

### Inland personnel

Enable **Show inland personnel** in Plugin Config to show passengers, crew and
other persons. Configure the **AIS input sentence event** to match the
`sentenceEvent` on the existing AIS input connection, for example
`ais-voyage-in` as used by SignalK2AIS. Do not use a global NMEA event or
an output event; the input must carry reports from the actual transceiver.
Sharing the same input event with SignalK2AIS does not open a second serial
connection. This plugin only listens; it does not transmit settings.

The counts come from checksum-validated `$PIWWIVD` reports on that event, not
from data submitted to SignalK2AIS or generated AIS messages. If the device
does not send the report, or a count is omitted or marked unavailable, the
display shows **Not available**. Counts are retained only in memory and reset on
restart; hover over a value for its receive time. Counts over 30 minutes old
are marked **outdated**. A count is not proof of the device's current
configuration, especially if the report is old.

Speed is converted from m/s to knots, angles from radians to degrees, and rate
of turn from radians/second to degrees/minute. Draught and dimensions are
metres. Antenna offsets are Signal K AIS sensor offsets, not necessarily
internal-GNSS antenna dimensions. Raw position reports contain a UTC second,
not a full date/time; direct mode leaves Date / time unavailable and shows the
second or positioning status separately. GNSS in use remains unavailable.
In Signal K mode, Date / time requires an AIS-sourced `navigation.datetime`.
The computer clock is never used as a substitute for reported vessel time.

## Develop

```sh
npm test
npm run check
npm pack --dry-run
npm run preview
```

The preview is at `http://127.0.0.1:18747/` and uses mock values. It is not
connected to a Signal K server or a real AIS device.

## License

MIT.
