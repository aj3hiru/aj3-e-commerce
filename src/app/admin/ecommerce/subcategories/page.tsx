import { redirect } from "next/navigation";

/** Sub-categories are no longer used — the store has categories only. */
export default function SubcategoriesPage() {
  redirect("/admin/ecommerce/categories");
}
