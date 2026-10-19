# Local MDX Dictionary

本地 MDX 网页词典插件 · Local MDX dictionary extension

## v1.0.5

[下载 v1.0.5 ZIP](dist/Local-MDX-Dictionary-v1.0.5-Local-Trial.zip)

支持多本 MDX 本地词典，点击、划词或可选悬停查词。先导入 MDX，再在每本词典那一行添加 MDD 和 CSS；支持暂时停用词典、替换和移除 CSS、列表内确认删除。

弹窗顶部可拖动，换词后保持拖动位置，关闭后重置；提供“仅点击 × 关闭”开关。修复移动端点击关闭后被旧触摸事件重新打开的问题。

Import MDX files first, then attach MDD resources and CSS from each dictionary row. Supports multiple dictionaries, temporary disabling, per-dictionary styles, inline deletion confirmation, draggable popups, and optional close-only-with-× behavior.

## 安装 / Install

下载 ZIP 并解压，在 `chrome://extensions` 开启开发者模式，选择“加载已解压的扩展程序”，选中 `extension` 文件夹。更新后重新加载扩展并刷新原网页。

Download and extract the ZIP, enable Developer mode in `chrome://extensions`, and load the `extension` folder with **Load unpacked**. Reload the extension and refresh webpages after updating.

词典与查询在本地处理，不附带词典，不需要账号或 API。界面支持简体中文、繁體中文、English、日本語、한국어。

Dictionaries and lookups stay on your device. No dictionaries are bundled; no account or API is required.

## 验证 / Validation

`node --test tests/*.test.cjs` — 11 logic tests passed. Browser integration has not been verified in this environment.

此版本是 GitHub 本地安装版；Chrome 商店未随此次更新。
