import type { Page } from '@playwright/test'

export const BROWSE_MENU_NAMES = [
  'Search',
  'Sort',
  'Filter',
  'View',
  'Select',
] as const

export async function forEachBrowseMenu(
  page: Page,
  callback: (menuName: (typeof BROWSE_MENU_NAMES)[number]) => Promise<void>,
): Promise<void> {
  for (const menuName of BROWSE_MENU_NAMES) {
    await page.getByRole('menuitem', { name: menuName, exact: true }).click()
    await page
      .locator('[data-radix-menubar-content][data-state="open"]')
      .waitFor()
    await callback(menuName)
  }
  await page.keyboard.press('Escape')
}
