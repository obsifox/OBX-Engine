# Playbook: WordPress / WooCommerce Plugin

## Common Mistakes
- Direct $_POST/$_GET without sanitization, missing nonces, SQL injection via $wpdb->query, XSS via echo unescaped, no capability checks, blocking main thread.

## Security Checklist
- Nonce for every form/AJAX: wp_verify_nonce
- Sanitization: sanitize_text_field, sanitize_email, etc; Escaping: esc_html, esc_attr, esc_url
- Capabilities: current_user_can check on admin actions
- $wpdb->prepare for all queries
- No secrets in code, no direct file access: defined('ABSPATH') check
- File uploads: mime check, size limit

## Performance Checklist
- No queries in loops, use transients for expensive ops, enqueue scripts only where needed, avoid autoloaded options bloat, measure with Query Monitor.

## Recommended Structure
```
plugin-name/
  plugin-name.php (header)
  includes/ classes/
  assets/ js/css
  templates/
  languages/
  readme.txt
```

## Verification
- PHPCS with WordPress standards if available, else manual review
- Activate/deactivate no fatal, test on clean WP + Woo
- Test with Query Monitor, check nonce failure, capability bypass attempt
- secret_scan.sh, check no hardcoded keys
