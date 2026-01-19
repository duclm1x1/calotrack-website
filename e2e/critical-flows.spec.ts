import { test, expect } from '@playwright/test';

/**
 * Landing Page E2E Tests
 */
test.describe('Landing Page', () => {
  test('should display hero section with CTA buttons', async ({ page }) => {
    await page.goto('/');
    
    // Check headline
    await expect(page.locator('h1')).toContainText('Track Calories');
    
    // Check CTA buttons
    await expect(page.getByRole('link', { name: /Dùng thử miễn phí/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Xem bảng giá/i })).toBeVisible();
  });

  test('should navigate to pricing section', async ({ page }) => {
    await page.goto('/');
    
    // Click pricing link
    await page.getByRole('link', { name: /Bảng giá/i }).click();
    
    // Check pricing section is visible
    await expect(page.locator('#pricing')).toBeVisible();
  });

  test('should display pricing tiers', async ({ page }) => {
    await page.goto('/');
    
    // Scroll to pricing
    await page.evaluate(() => document.getElementById('pricing')?.scrollIntoView());
    
    // Check all 3 tiers exist
    await expect(page.getByText('Trial 1 Ngày')).toBeVisible();
    await expect(page.getByText('Pro 1 Tháng')).toBeVisible();
    await expect(page.getByText('Lifetime')).toBeVisible();
  });

  test('should have responsive navbar', async ({ page }) => {
    await page.goto('/');
    
    // Check logo
    await expect(page.getByRole('link', { name: /CaloTrack/i })).toBeVisible();
    
    // Check auth buttons
    await expect(page.getByRole('link', { name: /Đăng nhập/i })).toBeVisible();
  });
});

/**
 * Auth Pages E2E Tests
 */
test.describe('Auth Pages', () => {
  test('login page should display form fields', async ({ page }) => {
    await page.goto('/login');
    
    await expect(page.getByPlaceholder(/email/i)).toBeVisible();
    await expect(page.getByPlaceholder(/password|mật khẩu/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Đăng nhập/i })).toBeVisible();
  });

  test('register page should display form fields', async ({ page }) => {
    await page.goto('/register');
    
    await expect(page.getByPlaceholder(/email/i)).toBeVisible();
    await expect(page.getByPlaceholder(/họ tên|name/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Đăng ký/i })).toBeVisible();
  });

  test('login should show error for invalid credentials', async ({ page }) => {
    await page.goto('/login');
    
    await page.getByPlaceholder(/email/i).fill('invalid@test.com');
    await page.getByPlaceholder(/password|mật khẩu/i).fill('wrongpassword');
    await page.getByRole('button', { name: /Đăng nhập/i }).click();
    
    // Should show error message
    await expect(page.getByText(/lỗi|error|invalid/i)).toBeVisible({ timeout: 5000 });
  });
});

/**
 * Dashboard E2E Tests (requires auth bypass or mock)
 */
test.describe('Dashboard - Static Content', () => {
  test('should display dashboard layout', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Without auth, should redirect to login
    await expect(page).toHaveURL(/login/);
  });
});

/**
 * Legal Pages E2E Tests
 */
test.describe('Legal Pages', () => {
  test('privacy page should be accessible', async ({ page }) => {
    await page.goto('/privacy');
    
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Chính Sách Bảo Mật/i);
  });

  test('terms page should be accessible', async ({ page }) => {
    await page.goto('/terms');
    
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Điều Khoản/i);
  });
});

/**
 * 404 Page Test
 */
test.describe('404 Page', () => {
  test('should display custom 404 for non-existent routes', async ({ page }) => {
    await page.goto('/non-existent-page');
    
    await expect(page.getByText('404')).toBeVisible();
    await expect(page.getByText(/Không tìm thấy/i)).toBeVisible();
  });
});
