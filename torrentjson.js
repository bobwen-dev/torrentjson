const fs = require("fs");
const process = require("process");
const path = require("path");

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2);
  let mode = null;
  let inputFile = null;
  let outputFile = null;
  let help = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-j") {
      mode = "to-json";
    } else if (arg === "-b") {
      mode = "to-bencode";
    } else if (arg === "--help") {
      help = true;
    } else if (arg.startsWith("-")) {
      // 忽略其他选项
    } else {
      if (inputFile === null) {
        inputFile = arg;
      } else if (outputFile === null) {
        outputFile = arg;
      }
    }
  }

  if (help || !mode) {
    if (/torrentjson/i.test(process.argv0)) {
      console.error(
        `Usage: ${process.argv0.replace(/\.exe$/i, '')} -j | -b [input_file] [output_file]`
      );
    } else {
      console.error(
        `Usage: ${process.argv0} ${process.argv[1]
          .split(/[\/\\]+/)
          .pop()} -j | -b [input_file] [output_file]`
      );
    }
    console.error("  -j: Convert from .torrent to .json");
    console.error("  -b: Convert from .json to .torrent");
    console.error(
      "If no input_file, read from stdin; if no output_file, write to stdout"
    );
    process.exit(1);
  }

  return { mode, inputFile, outputFile };
}

// Bencode 解码函数 - 处理 Buffer 输入
function decodeBencode(buffer, start = 0) {
  if (start >= buffer.length) {
    throw new Error("Unexpected end of data");
  }

  const char = String.fromCharCode(buffer[start]);
  if (char === "i") {
    // 整数
    let end = start + 1;
    while (end < buffer.length && String.fromCharCode(buffer[end]) !== "e") {
      end++;
    }
    if (end >= buffer.length) {
      throw new Error("Invalid integer: missing ending e");
    }

    const numStr = buffer.toString("ascii", start + 1, end);
    // 检查是否为大整数
    if (numStr.length > 15) {
      return { value: BigInt(numStr), end: end + 1 };
    }
    const num = Number(numStr);
    if (isNaN(num)) {
      throw new Error("Invalid integer: not a number");
    }
    return { value: num, end: end + 1 };
  } else if (char === "l") {
    // 列表
    let list = [];
    let index = start + 1;
    while (index < buffer.length) {
      if (String.fromCharCode(buffer[index]) === "e") {
        return { value: list, end: index + 1 };
      }
      const decoded = decodeBencode(buffer, index);
      list.push(decoded.value);
      index = decoded.end;
    }
    throw new Error("Invalid list: missing ending e");
  } else if (char === "d") {
    // 字典
    let dict = {};
    let index = start + 1;
    while (index < buffer.length) {
      if (String.fromCharCode(buffer[index]) === "e") {
        return { value: dict, end: index + 1 };
      }
      // 键必须是字符串
      const keyDecoded = decodeBencode(buffer, index);
      if (Buffer.isBuffer(keyDecoded.value)) {
        // 将 Buffer 键转换为字符串
        dict[keyDecoded.value.toString("utf8")] = null;
      } else if (typeof keyDecoded.value === "string") {
        dict[keyDecoded.value] = null;
      } else {
        throw new Error("Dictionary key must be string");
      }

      const valueDecoded = decodeBencode(buffer, keyDecoded.end);
      // 获取最后一个键
      const keys = Object.keys(dict);
      const lastKey = keys[keys.length - 1];
      dict[lastKey] = valueDecoded.value;
      index = valueDecoded.end;
    }
    return { value: dict, end: index };
  } else if (char >= "0" && char <= "9") {
    // 字符串 - 查找冒号
    let colonIndex = start;
    while (
      colonIndex < buffer.length &&
      String.fromCharCode(buffer[colonIndex]) !== ":"
    ) {
      colonIndex++;
    }
    if (colonIndex >= buffer.length) {
      throw new Error("Invalid string: missing colon");
    }

    const lengthStr = buffer.toString("ascii", start, colonIndex);
    const length = Number(lengthStr);
    if (isNaN(length) || length < 0) {
      throw new Error("Invalid string length");
    }

    const stringStart = colonIndex + 1;
    const stringEnd = stringStart + length;
    if (stringEnd > buffer.length) {
      throw new Error("Invalid string: length too long");
    }

    // 返回原始 Buffer
    const strData = buffer.slice(stringStart, stringEnd);

    // 尝试将 Buffer 转换为字符串，如果可能
    try {
      const utf8String = strData.toString("utf8");
      // 检查是否包含不可打印字符
      if (/^[\x20-\x7E\x09\x0A\x0D]*$/.test(utf8String)) {
        return { value: utf8String, end: stringEnd };
      }
    } catch (e) {
      // 如果转换失败，保持为 Buffer
    }

    return { value: strData, end: stringEnd };
  } else {
    throw new Error(`Invalid character: ${char}`);
  }
}

// Bencode 编码函数
function encodeBencode(obj) {
  if (typeof obj === "number" || typeof obj === "bigint") {
    return `i${obj}e`;
  } else if (typeof obj === "string") {
    const buf = Buffer.from(obj, "utf8");
    return `${buf.length}:${obj}`;
  } else if (Buffer.isBuffer(obj)) {
    return `${obj.length}:${obj.toString("binary")}`;
  } else if (Array.isArray(obj)) {
    let encoded = "l";
    for (const item of obj) {
      encoded += encodeBencode(item);
    }
    encoded += "e";
    return encoded;
  } else if (typeof obj === "object" && obj !== null) {
    // 字典需要按键排序
    let encoded = "d";
    const keys = Object.keys(obj).sort();
    for (const key of keys) {
      const value = obj[key];
      encoded += encodeBencode(key);
      encoded += encodeBencode(value);
    }
    encoded += "e";
    return encoded;
  } else {
    throw new Error(`Unsupported type: ${typeof obj}`);
  }
}

// 将对象转换为 JSON 格式，处理二进制和大整数
function convertToJson(obj) {
  if (Array.isArray(obj)) {
    return obj.map((item) => convertToJson(item));
  } else if (typeof obj === "object" && obj !== null) {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      let newKey = key;
      let newValue = value;

      if (Buffer.isBuffer(value)) {
        // 所有二进制字段都转换为 hex 并添加 @hex 后缀
        newValue = value.toString("hex");
        newKey = `${key}@hex`;
      } else if (typeof value === "bigint") {
        // 大整数转换为字符串并添加 @bigint 后缀
        newValue = value.toString();
        newKey = `${key}@bigint`;
      } else if (Array.isArray(value) || typeof value === "object") {
        newValue = convertToJson(value);
      }

      result[newKey] = newValue;
    }
    return result;
  } else {
    return obj;
  }
}

// 将 JSON 对象转换回 Bencode 所需格式，处理二进制和大整数
function convertFromJson(obj) {
  if (Array.isArray(obj)) {
    return obj.map((item) => convertFromJson(item));
  } else if (typeof obj === "object" && obj !== null) {
    const result = {};
    for (let [key, value] of Object.entries(obj)) {
      let originalKey = key;
      let originalValue = value;

      // 检查后缀并处理相应字段
      if (key.endsWith("@bigint")) {
        originalKey = key.slice(0, -7);
        originalValue = BigInt(value);
      } else if (key.endsWith("@hex")) {
        originalKey = key.slice(0, -4);
        originalValue = Buffer.from(value, "hex");
      } else if (Array.isArray(value) || typeof value === "object") {
        originalValue = convertFromJson(value);
      }

      result[originalKey] = originalValue;
    }
    return result;
  } else {
    return obj;
  }
}

// 主函数
async function main() {
  const { mode, inputFile, outputFile } = parseArgs();

  // 读取输入
  let inputBuffer;
  if (inputFile) {
    inputBuffer = fs.readFileSync(inputFile);
  } else {
    // 从 stdin 读取
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    inputBuffer = Buffer.concat(chunks);
  }

  let outputData;
  if (mode === "to-json") {
    // 解析 Bencode
    const decoded = decodeBencode(inputBuffer);
    if (decoded.end !== inputBuffer.length) {
      console.error("Warning: Extra data after bencode object");
    }
    // 转换为 JSON 对象
    const jsonObj = convertToJson(decoded.value);
    outputData = JSON.stringify(jsonObj, null, 2);
  } else {
    // 解析 JSON
    const jsonStr = inputBuffer.toString("utf8");
    const jsonObj = JSON.parse(jsonStr);
    // 转换回 Bencode 对象
    const bencodeObj = convertFromJson(jsonObj);
    outputData = encodeBencode(bencodeObj);
  }

  // 写入输出
  if (outputFile) {
    fs.writeFileSync(
      outputFile,
      outputData,
      mode === "to-json" ? "utf8" : "binary"
    );
  } else {
    process.stdout.write(outputData, mode === "to-json" ? "utf8" : "binary");
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
