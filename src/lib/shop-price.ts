/** Verified against the repeated `(!empty($p['sale_price']) && sale_price > 0 &&
 *  sale_price < price) ? sale_price : price` pattern across product-card.php,
 *  category.php, product.php, cart.php, checkout.php. */
export function effectivePrice(price: number, salePrice: number | null | undefined): number {
  return salePrice && salePrice > 0 && salePrice < price ? salePrice : price;
}
