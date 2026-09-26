import 'package:flutter_test/flutter_test.dart';
import 'package:sri_staff/core/barcode.dart';

void main() {
  final products = [
    {'id': 1, 'name': 'Ghee', 'barcode': '8901001234567', 'status': 'active'},
    {'id': 2, 'name': 'Old', 'barcode': '036000291452', 'status': 'inactive'},
    {'id': 3, 'name': 'Honey', 'barcode': ' em00000012 ', 'sku': 'HN-500', 'status': 'active'},
  ];
  test('exact barcode', () => expect(findByCode(products, '8901001234567')?['id'], 1));
  test('spaces and newline from the scanner', () => expect(findByCode(products, ' 8901001234567\n')?['id'], 1));
  test('UPC-A read as EAN-13 (leading zero)', () => expect(findByCode(products, '0036000291452')?['id'], 2));
  test('letter case and SKU', () {
    expect(findByCode(products, 'EM00000012')?['id'], 3);
    expect(findByCode(products, 'hn-500')?['id'], 3);
  });
  test('unknown code', () => expect(findByCode(products, '123'), isNull));
}
