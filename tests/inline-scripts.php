<?php
/**
 * What the plugin's enqueue hook prints inside a <script> element when text from the
 * database decides part of it.
 *
 * Two inline scripts carry such text: the create() call, which is a stored configuration,
 * and the console warning for a page that ends up configured by nothing, which names the
 * fields a stored configuration was refused for — the configuration's own keys, as stored
 * — and the file looked for under the page's slug. A row written straight into the
 * database never passed through the plugin's save, so either text can be anything.
 *
 * WordPress hands an inline script's text to the page as it stands (6.1 does; later
 * versions escape it themselves), so it is the plugin's to make safe there. Inside a
 * script element the HTML parser reacts to one character only, "<": "</script" ends the
 * element early, and "<!--" followed by "<script" puts the parser in a state where the
 * element's real closing tag no longer ends it, and the rest of the page — every script
 * and all markup printed after it — is swallowed as script text. A text with no "<" in it
 * can do neither, whatever else it holds. That is the rule held here, for every inline
 * script the hook attaches: no "<", and the JavaScript still says what was stored.
 *
 *   docker run --rm -v "$PWD":/w:ro php:7.4-cli php /w/tests/inline-scripts.php
 *
 * An argument names another copy of the plugin's directory to judge. With --json nothing
 * is asserted: the inline scripts of each case are printed as JSON, for a look at them
 * through an HTML parser.
 */
define( 'ABSPATH', __DIR__ . '/' );

$as_json    = in_array( '--json', $argv, true );
$other      = array_values( array_diff( array_slice( $argv, 1 ), array( '--json' ) ) );
$plugin_dir = $other ? rtrim( $other[0], '/' ) : __DIR__ . '/../plugin/silexgis-caveview-3d';

/* ---- WordPress, as far as the hook reaches into it ---------------------------------------- */

class WP_Post {
	public $ID = 7;
	public $post_name = '';
	public $post_content = '';
}
$GLOBALS['silex_hooks']  = array();
$GLOBALS['silex_meta']   = '';
$GLOBALS['silex_inline'] = array();
function add_action( $hook, $callback, $priority = 10, $args = 1 ) { $GLOBALS['silex_hooks'][ $hook ][] = $callback; }
function add_filter( $hook, $callback, $priority = 10, $args = 1 ) { add_action( $hook, $callback, $priority, $args ); }
function add_shortcode() {}
function __( $s ) { return $s; }
// What is stored and the site's language, as each case sets them; nothing stored by default.
$GLOBALS['silex_options'] = array();
$GLOBALS['silex_locale']  = 'en_US';
function get_option( $name, $default = false ) { return array_key_exists( $name, $GLOBALS['silex_options'] ) ? $GLOBALS['silex_options'][ $name ] : $default; }
function get_locale() { return $GLOBALS['silex_locale']; }
function get_post_meta() { return $GLOBALS['silex_meta']; }
function untrailingslashit( $s ) { return rtrim( $s, '/\\' ); }
function trailingslashit( $s ) { return untrailingslashit( $s ) . '/'; }
function plugins_url( $path, $file ) { return 'https://example.test/wp-content/plugins/silexgis-caveview-3d/' . $path; }
function wp_make_link_relative( $url ) { return preg_replace( '#^https?://[^/]+#', '', $url ); }
function rest_url( $path ) { return 'https://example.test/wp-json/' . $path; }
function wp_upload_dir() { return array( 'basedir' => __DIR__ . '/uploads', 'baseurl' => 'https://example.test/wp-content/uploads' ); }
function apply_filters( $hook, $value ) { return $value; }
function sanitize_html_class( $s ) { return $s; }
function has_shortcode( $content, $tag ) { return false !== strpos( $content, '[' . $tag ); }
// As WordPress's own for text that is valid UTF-8: json_encode() with the flags it is given.
function wp_json_encode( $v, $flags = 0 ) { return json_encode( $v, $flags ); }
function wp_parse_args( $args, $defaults = array() ) { return array_merge( $defaults, (array) $args ); }
function is_singular() { return true; }
function get_post() { return $GLOBALS['silex_post']; }
function wp_enqueue_style() {}
function wp_enqueue_script() {}
function wp_add_inline_script( $handle, $code, $position = 'after' ) { $GLOBALS['silex_inline'][] = $code; }
if ( ! function_exists( 'mb_strlen' ) ) { function mb_strlen( $s ) { return strlen( $s ); } function mb_substr( $s, $a, $b ) { return substr( $s, $a, $b ); } }

$failed = 0;
$count  = 0;
function check( $name, $ok, $detail = '' ) {
	global $failed, $count, $as_json;
	$count++;
	if ( ! $as_json ) {
		echo ( $ok ? 'ok    ' : 'FAIL  ' ) . $name . ( $ok || '' === $detail ? '' : ' — ' . $detail ) . "\n";
	}
	if ( ! $ok ) { $failed++; }
}

// The constants' values are read out of the plugin's main file rather than retyped; the
// main file itself is not loaded, because it would load the proxy and the admin screens.
$main = file_get_contents( $plugin_dir . '/silexgis-caveview-3d.php' );
define( 'SILEX_CE_FILE', $plugin_dir . '/silexgis-caveview-3d.php' );
define( 'SILEX_CE_DIR', $plugin_dir );
foreach ( array( 'SILEX_CE_VERSION', 'SILEX_CE_SLUG', 'SILEX_CE_CAVEVIEW_BUILD', 'SILEX_CE_SHORTCODE', 'SILEX_CE_REST_NAMESPACE', 'SILEX_CE_UPLOADS_DIR', 'SILEX_CE_META_KEY', 'SILEX_CE_OPTION_ASSETS_BASE', 'SILEX_CE_OPTION_CAVEVIEW_HOME',
	'SILEX_CE_OPTION_LABEL_SCALE', 'SILEX_CE_DEFAULT_LABEL_SCALE', 'SILEX_CE_OPTION_LANGUAGE', 'SILEX_CE_LANGUAGE_AUTO' ) as $constant ) {
	preg_match( "/define\( '" . $constant . "', '([^']+)' \);/", $main, $m ) || exit( "no $constant in the plugin's main file\n" );
	define( $constant, $m[1] );
}
// The two that are not texts: the size's bounds, and the languages the pages offer.
foreach ( array( 'SILEX_CE_LABEL_SCALE_MIN', 'SILEX_CE_LABEL_SCALE_MAX' ) as $constant ) {
	preg_match( "/define\( '" . $constant . "', ([0-9.]+) \);/", $main, $m ) || exit( "no $constant in the plugin's main file\n" );
	define( $constant, (float) $m[1] );
}
preg_match( "/define\( 'SILEX_CE_LANGUAGES', (array\( '[^;]*\)) \);/", $main, $m ) || exit( "no SILEX_CE_LANGUAGES in the plugin's main file\n" );
define( 'SILEX_CE_LANGUAGES', eval( 'return ' . $m[1] . ';' ) );
require $plugin_dir . '/includes/shortcode.php';
require $plugin_dir . '/includes/assets.php';

/** Runs the enqueue hook for a page and returns the inline scripts it attached, as their text. */
function inline_for( $slug, $stored ) {
	$post               = new WP_Post();
	$post->post_name    = $slug;
	$post->post_content = '[silexgis_cave id="cave_model"]';
	$GLOBALS['silex_post']   = $post;
	$GLOBALS['silex_meta']   = $stored;
	$GLOBALS['silex_inline'] = array();
	foreach ( $GLOBALS['silex_hooks']['wp_enqueue_scripts'] as $callback ) {
		$callback();
	}

	return $GLOBALS['silex_inline'];
}

/** The one argument of a "name(<JSON>);" script, decoded as the JavaScript engine reads it; null when it is not that. */
function argument_of( $code, $call ) {
	$head = $call . '(';
	if ( 0 !== strpos( $code, $head ) || ');' !== substr( $code, -2 ) ) {
		return null;
	}

	return json_decode( substr( $code, strlen( $head ), -2 ) );
}

/* ---- the pages ------------------------------------------------------------------------------ */

// The two texts that take the parser out of the script element, and one that only looks it.
$opens  = '<!--<script>';
$closes = '</script><script>alert(1)</script>';

$cases = array(
	// name => slug, stored text, the script expected ('warn' or 'create'), what its text must still say
	'a refused configuration whose key opens a comment and a script' => array(
		'pagina', '{"container":"cave_model","' . $opens . '":{"__proto__":{}}}', 'warn', $opens . '.__proto__' ),
	'a refused configuration whose key closes the script' => array(
		'pagina', '{"container":"cave_model","' . str_replace( '/', '\\/', $closes ) . '":{"__proto__":{}}}', 'warn', $closes . '.__proto__' ),
	'a refused configuration whose keys do both, nested' => array(
		'pagina', '{"container":"cave_model","a<!--":{"<script":{"-->":{"__proto__":{}}}}}', 'warn', 'a<!--.<script.-->.__proto__' ),
	'a refused configuration with nothing odd in its keys' => array(
		'pagina', '{"container":"cave_model","home":"https://attacker.example/x/"}', 'warn', ': home.' ),
	'a text that is not JSON' => array(
		'pagina', '{"container":' . $opens, 'warn', 'is not valid JSON' ),
	'a slug written past WordPress, which opens a comment and a script' => array(
		$opens, '', 'warn', 'pages/' . $opens . '.js' ),
	'a page with no slug at all' => array(
		'', '', 'warn', '<empty slug>.js' ),
	'a printed configuration whose values and keys open and close everything' => array(
		'pagina', '{"container":"cave_model","' . $opens . '":"' . str_replace( '/', '\\/', $closes ) . '","note":"' . $opens . '-->"}', 'create', null ),
);

$printed = array();
foreach ( $cases as $name => $case ) {
	list( $slug, $stored, $kind, $says ) = $case;
	$scripts          = inline_for( $slug, $stored );
	$printed[ $name ] = $scripts;

	$call = ( 'warn' === $kind ) ? 'console.warn' : 'window.SilexCaveEmbed.create';
	$mine = array_values( array_filter( $scripts, function ( $code ) use ( $call ) { return 0 === strpos( $code, $call . '(' ); } ) );
	// The site's settings, printed before the component on every page with a model, are not the
	// page's configuration and hold nothing a page wrote; they are counted apart, and are looked
	// at for a "<" below with everything else.
	$page_own = array_values( array_filter( $scripts, function ( $code ) { return 0 !== strpos( $code, 'window.SilexCaveEmbedSite = ' ); } ) );
	check( "$name: one inline script, the " . ( 'warn' === $kind ? 'console warning' : 'create() call' ), 1 === count( $page_own ) && 1 === count( $mine ), count( $page_own ) . ' inline script(s)' );

	$with = array_filter( $scripts, function ( $code ) { return false !== strpos( $code, '<' ); } );
	check( "$name: no inline script holds a \"<\"", ! $with, count( $with ) . ' of ' . count( $scripts ) . ' do' );

	$value = $mine ? argument_of( $mine[0], $call ) : null;
	if ( 'warn' === $kind ) {
		check( "$name: and the console is still told what was stored, letter for letter", is_string( $value ) && false !== strpos( $value, $says ),
			is_string( $value ) ? 'the warning does not name it' : 'the script is not console.warn(<one text>);' );
	} else {
		check( "$name: and create() is still handed the configuration as stored", is_object( $value ) && json_encode( $value ) === json_encode( json_decode( $stored ) ),
			is_object( $value ) ? 'another object' : 'the script is not create(<one object>);' );
	}
}

/* ---- the language every page is told --------------------------------------------------------- */

// The site's settings hand the component a language it has a catalogue for, always: the stored
// choice, or for "the site's language" the site's own where the pages offer it and English
// where they do not — never the word "auto", which the component would take for a language.
/** The language the site's settings script tells pages, or null when there is no such script. */
function language_told() {
	foreach ( inline_for( 'pagina', '' ) as $code ) {
		if ( 0 === strpos( $code, 'window.SilexCaveEmbedSite = ' ) ) {
			$site = json_decode( substr( $code, strlen( 'window.SilexCaveEmbedSite = ' ), -1 ) );
			return is_object( $site ) && isset( $site->language ) ? $site->language : null;
		}
	}
	return null;
}
foreach ( array(
	// stored choice (null: nothing stored), the site's locale, what pages are told
	array( null, 'ro_RO', 'ro' ),
	array( null, 'en_US', 'en' ),
	array( null, 'en_GB', 'en' ),
	array( null, 'de_DE', 'en' ),
	array( null, '', 'en' ),
	array( 'auto', 'ro_RO', 'ro' ),
	array( 'auto', 'fr_FR', 'en' ),
	array( 'ro', 'en_US', 'ro' ),
	array( 'en', 'ro_RO', 'en' ),
	array( 'xx', 'ro_RO', 'ro' ),
) as $case ) {
	list( $stored, $locale, $told ) = $case;
	$GLOBALS['silex_options'] = null === $stored ? array() : array( SILEX_CE_OPTION_LANGUAGE => $stored );
	$GLOBALS['silex_locale']  = $locale;
	$got = language_told();
	check( 'stored ' . ( null === $stored ? 'nothing' : '"' . $stored . '"' ) . ' on a site in "' . $locale . '": pages are told "' . $told . '"', $told === $got, var_export( $got, true ) );
}
$GLOBALS['silex_options'] = array();
$GLOBALS['silex_locale']  = 'en_US';

if ( $as_json ) {
	echo json_encode( $printed ) . "\n";
	exit( 0 );
}
echo "\n$count checks: " . ( $failed ? "$failed failed" : 'all good' ) . "\n";
exit( $failed ? 1 : 0 );
