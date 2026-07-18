const { readFile, writeFile } = require("node:fs/promises");
const { dirname, join } = require("node:path");

module.exports = async function setSimplifiedChineseMsiCodepage(projectPath) {
  const source = await readFile(projectPath, "utf8");
  const marker = 'Language="1033" Codepage="65001"';
  if (!source.includes(marker)) {
    throw new Error("Could not locate the MSI language and codepage marker.");
  }

  await writeFile(
    projectPath,
    source.replace(marker, 'Language="2052" Codepage="936"'),
    "utf8",
  );

  const localization = `<?xml version="1.0" encoding="UTF-8"?>
<WixLocalization xmlns="http://wixtoolset.org/schemas/v4/wxl" Culture="zh-CN" Language="2052" Codepage="936" />
`;
  await writeFile(join(dirname(projectPath), "zh-cn.wxl"), localization, "utf8");
};
