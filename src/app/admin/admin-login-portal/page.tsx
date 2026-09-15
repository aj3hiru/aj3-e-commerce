import { redirect } from "next/navigation";

/**
 * Verified against admin/admin-login-portal.php:
 *   // Login is now unified — admin, staff, and customer accounts all sign in
 *   // from the same page. Old bookmarks to this page are kept working here.
 *   header('Location: /shop/login.php');
 *
 * Kept as a route purely so old bookmarks/links to this URL keep working.
 */
export default function AdminLoginPortalRedirect() {
  redirect("/shop/login");
}
