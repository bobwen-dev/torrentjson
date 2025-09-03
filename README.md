# Torrent JSON Converter

A Node.js utility for lossless conversion between `.torrent` files and JSON format, making torrent metadata easily readable and editable while ensuring perfect round-trip conversion.

## Features

- **Lossless Conversion**: Preserves all data when converting between `.torrent` and JSON formats
- **Human-Readable JSON**: Binary data (like pieces hash) is converted to hex format with `@hex` suffix
- **BigInt Support**: Handles large integers correctly with `@bigint` suffix
- **Pipe Support**: Works with stdin/stdout for use in pipelines
- **No Dependencies**: Pure Node.js implementation with no external dependencies
- **Robust Error Handling**: Gracefully handles malformed data and edge cases

## Installation

```bash
git clone https://github.com/bobwen-dev/torrentjson.git
cd torrentjson
```

## Usage

### Convert .torrent to JSON

```bash
# Convert file to JSON
node torrentjson.js -j input.torrent output.json

# Use stdin/stdout
cat input.torrent | node torrentjson.js -j > output.json
```

### Convert JSON to .torrent

```bash
# Convert JSON to torrent
node torrentjson.js -b input.json output.torrent

# Use stdin/stdout
cat input.json | node torrentjson.js -b > output.torrent
```

## JSON Format

The converter produces JSON that maintains the structure of the original torrent file while making binary data human-readable:

```json
{
  "announce": "udp://tracker.leechers-paradise.org:6969/announce",
  "announce-list": [
    [
      "udp://tracker.opentrackr.org:1337/announce"
    ],
    [
      "udp://tracker.torrent.eu.org:451/announce"
    ],
    [
      "udp://torrentclub.tech:6969/announce"
    ],
    [
      "udp://tracker.openbittorrent.com:6969/announce"
    ],
    [
      "udp://opentracker.i2p.rocks:6969/announce"
    ],
    [
      "udp://bt1.archive.org:6969/announce"
    ],
    [
      "udp://bt2.archive.org:6969/announce"
    ],
    [
      "http://tracker.opentrackr.org:1337/announce"
    ]
  ],
  "comment": "dynamic metainfo from client",
  "created by": "torrentjson",
  "creation date": 1586695224,
  "info": {
    "files": [
      {
        "length": 3902813502,
        "path": [
          "test.mkv"
        ]
      },
      {
        "length": 30,
        "path": [
          "test.txt"
        ]
      }
    ],
    "name": "test.folder",
    "piece length": 2097152,
    "pieces@hex": "93abca30414e5e...a97651"
  }
}
```

### Special Field Suffixes

- `@hex`: Binary data converted to hexadecimal string (e.g., `pieces@hex`)
- `@bigint`: Large integers converted to string representation (e.g., `creation date@bigint`)

## Examples

### Basic Conversion

```bash
# Convert torrent to JSON
node torrentjson.js -j ubuntu.torrent ubuntu.json

# Edit the JSON file
vim ubuntu.json

# Convert back to torrent
node torrentjson.js -b ubuntu.json modified.torrent
```

### Pipeline Usage

```bash
# Download a torrent and convert to JSON in one command
curl -s https://example.com/file.torrent | node torrentjson.js -j > file.json

# Convert multiple torrents to JSON
for f in *.torrent; do
  node torrentjson.js -j "$f" "${f%.torrent}.json"
done
```

## API

The module exports the following functions for programmatic use:

```javascript
const { decodeBencode, encodeBencode, convertToJson, convertFromJson } = require('./torrentjson.js');

// Decode bencoded data
const decoded = decodeBencode(torrentBuffer);

// Convert to JSON format
const jsonData = convertToJson(decoded.value);

// Convert back to bencode format
const bencodeData = convertFromJson(jsonData);

// Encode to bencode string
const bencodeString = encodeBencode(bencodeData);
```

## License

MIT License

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Issues

If you encounter any problems or have suggestions, please open an issue on GitHub.