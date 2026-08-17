// Keep CI builds independent of the Google Fonts network endpoint. Next's
// built-in font loader reads this module when NEXT_FONT_GOOGLE_MOCKED_RESPONSES
// is set and asks it for the CSS response for each requested family/weight.
// Local system fonts are sufficient for CI's functional/browser assertions;
// production builds continue to download and self-host the declared families.
module.exports = new Proxy(
  {},
  {
    get(_target, property) {
      if (typeof property !== 'string') return undefined
      return `/* latin */
@font-face {
  font-family: '${property}';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: local("Arial");
}`
    },
  },
)
