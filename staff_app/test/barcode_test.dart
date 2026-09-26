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
  test('unknown code', () => expect(findByCode(products, '12345678901'), isNull));
  final more = [
    {'id': 7, 'name': 'Typed without check digit', 'barcode': '890100123456', 'status': 'active'},
    {'id': 8, 'name': 'UPC-A', 'barcode': '012345000065', 'status': 'active'},
    {'id': 9, 'name': 'Partly typed', 'barcode': '4006381333931', 'status': 'active'},
  ];
  test('check digit missing in the saved barcode', () => expect(findByCode(more, '8901001234567')?['id'], 7));
  test('UPC-E read for a UPC-A product', () => expect(findByCode(more, '01234565')?['id'], 8));
  test('only one product contains the code', () => expect(findByCode(more, '381333931')?['id'], 9));
  test('product id like the website', () => expect(findByCode(more, '9')?['id'], 9));
}
