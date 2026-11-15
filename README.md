# S2KDisplay

A read-only Signal K display for **own-vessel AIS data**, with vessel/voyage and
dynamic-data screens. It also supplies a Freeboard-SK extension side panel.

**Not a certified AIS display.** Signal K may not receive all of the messages,
fields or hardware status shown on the transceiver. This plugin does not decode
raw AIS sentences itself and cannot verify what the transceiver actually sends.
Do not use it as the sole source for navigation or safety decisions.

## Installation

This project is not yet published on npm. For testing, pack the repository
with `npm pack`, copy the archive to the Signal K server and install it from
the Signal K configuration directory:

```sh
cd /data/conf/signalk
npm install /path/to/signalk-s2k-display-0.1.0.tgz
```

Restart Signal K and enable **S2KDisplay** under **Plugin Config**. In the
plugin settings add the exact AIS `$source` identifier(s) visible in the Signal
K Data Browser (for example `my-ais.AIVDO`; your actual identifier will differ).
No data is shown until at least one source is configured. Select only sources
that you know carry your own transceiver's reports. Do not select output from
an AIS generator if the intention is to inspect the actual hardware.

Open **Webapps → S2KDisplay**. In Freeboard-SK, use the extension toolbar
button for the **AIS display** side panel. This needs a Freeboard version
supporting `plotterExtensions` iframe panels, and a Signal K server supporting
resource providers. Older installations may still use the standalone webapp.

## Data and limitations

The plugin subscribes to `vessels.self` updates from all sources and retains
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
Fields not provided by those updates are shown as **Not available**; crew,
accuracy, RAIM and internal/external GNSS are not inferred. Existing AIS
equipment settings cannot be edited from this display.

Speed is converted from m/s to knots, angles from radians to degrees, and rate
of turn from radians/second to degrees/minute. Draught and dimensions are
metres. Antenna offsets are Signal K AIS sensor offsets, not necessarily
internal-GNSS antenna dimensions. The date/time field requires an AIS-sourced
Signal K `navigation.datetime`; the computer clock is not used as a substitute.

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
