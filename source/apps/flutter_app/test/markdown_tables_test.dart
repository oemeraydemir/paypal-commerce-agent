import 'package:flutter_test/flutter_test.dart';

import 'package:flutter_app/utils/markdown_tables.dart';

void main() {
  test('a markdown table becomes one table block, text around it is kept', () {
    final blocks = splitMarkdownBlocks(
      'Here is your cart:\n'
      '| Item | Qty | Price |\n'
      '| --- | --- | --- |\n'
      '| Toast | 2 | €17.00 |\n'
      '| Pancakes | 2 | €18.00 |\n'
      'Total €35.00',
    );
    expect(blocks.map((b) => b.isTable), [false, true, false]);
    expect(blocks[0].text, 'Here is your cart:');
    expect(blocks[1].header, ['Item', 'Qty', 'Price']);
    expect(blocks[1].rows, [
      ['Toast', '2', '€17.00'],
      ['Pancakes', '2', '€18.00'],
    ]);
    expect(blocks[2].text, 'Total €35.00');
  });

  test('pipe lines without a separator row stay plain text', () {
    final blocks = splitMarkdownBlocks('| just | a line |');
    expect(blocks, hasLength(1));
    expect(blocks.single.isTable, isFalse);
    expect(blocks.single.text, '| just | a line |');
  });

  test('a header and separator without any data row is not a table', () {
    final blocks = splitMarkdownBlocks('| A | B |\n| --- | --- |');
    expect(blocks.every((b) => !b.isTable), isTrue);
  });

  test('alignment colons in the separator row are accepted', () {
    final blocks = splitMarkdownBlocks('|A|B|\n|:---|---:|\n|x|y|');
    expect(blocks.single.isTable, isTrue);
    expect(blocks.single.rows, [
      ['x', 'y'],
    ]);
  });

  test('windows line endings and plain text without tables are untouched', () {
    expect(splitMarkdownBlocks('one\r\ntwo').single.text, 'one\ntwo');
    expect(splitMarkdownBlocks(''), isEmpty);
  });
}
