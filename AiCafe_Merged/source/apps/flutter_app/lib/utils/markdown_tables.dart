/// A piece of an assistant message: plain text, or a Markdown table that the
/// UI draws as cards (one per row) instead of a spreadsheet-like grid.
///
/// Mirrors `renderMarkdown` in the web storefront (`backend/public/app.js`):
/// a block of `|` lines is a table only when it has a header, a `---` separator
/// row and at least one data row. Anything else stays plain text.
class MdBlock {
  final String? text;
  final List<String>? header;
  final List<List<String>>? rows;

  const MdBlock.text(String this.text) : header = null, rows = null;
  const MdBlock.table(List<String> this.header, List<List<String>> this.rows)
    : text = null;

  bool get isTable => header != null;
}

final RegExp _separatorCell = RegExp(r'^:?-{3,}:?$');

List<String> _splitRow(String line) {
  var t = line.trim();
  if (t.startsWith('|')) t = t.substring(1);
  if (t.endsWith('|')) t = t.substring(0, t.length - 1);
  return t.split('|').map((c) => c.trim()).toList();
}

bool _isSeparator(List<String> cells) =>
    cells.isNotEmpty && cells.every(_separatorCell.hasMatch);

/// Splits [source] into text and table blocks, keeping the original order.
List<MdBlock> splitMarkdownBlocks(String source) {
  final lines = source.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n');
  final blocks = <MdBlock>[];
  final pending = <String>[];

  void flushText() {
    if (pending.isEmpty) return;
    final joined = pending.join('\n').trim();
    pending.clear();
    if (joined.isNotEmpty) blocks.add(MdBlock.text(joined));
  }

  var i = 0;
  while (i < lines.length) {
    if (lines[i].trim().startsWith('|')) {
      var j = i;
      final rows = <List<String>>[];
      while (j < lines.length && lines[j].trim().startsWith('|')) {
        rows.add(_splitRow(lines[j]));
        j++;
      }
      if (rows.length >= 3 && _isSeparator(rows[1])) {
        flushText();
        blocks.add(MdBlock.table(rows[0], rows.sublist(2)));
        i = j;
        continue;
      }
    }
    pending.add(lines[i]);
    i++;
  }
  flushText();
  return blocks;
}
