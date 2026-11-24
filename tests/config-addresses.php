<?php
/**
 * The rule that keeps a page's configuration on this site, driven with the shapes somebody
 * would use to get out of it: an absolute address, a protocol-relative one, a backslash in
 * place of the second slash, a tab the browser drops, a lone slash that becomes "//" when
 * the viewer joins a name onto it, a list or an object where a text is expected, and a
 * key named __proto__ that a JavaScript object literal turns into the object's prototype.
 * Each case names the fields that must be refused, and the fields that must not.
 *
 * The example configuration, ../examples/page-config-paths.json, must pass as it is.
 *
 *   docker run --rm -v "$PWD":/w:ro php:7.4-cli php /w/tests/config-addresses.php
 *
 * An argument names another copy of includes/shortcode.php to judge. With --json nothing is
 * asserted: the cases and this file's verdict on each are printed as JSON, for
 * config-addresses-box.mjs, which holds the box's own script to the same verdicts.
 */
define( 'ABSPATH', '/nonexistent/' );
define( 'SILEX_CE_META_KEY', '_silex_cave_embed_config' );
function __( $s ) { return $s; }
function add_action() {}
function add_shortcode() {}
function wp_json_encode( $v, $flags = 0 ) { return json_encode( $v, $flags ); }
function get_post_meta() { return ''; }
if ( ! function_exists( 'mb_strlen' ) ) { function mb_strlen( $s ) { return strlen( $s ); } function mb_substr( $s, $a, $b ) { return substr( $s, $a, $b ); } }

$as_json = in_array( '--json', $argv, true );
$other   = array_values( array_diff( array_slice( $argv, 1 ), array( '--json' ) ) );
require $other ? $other[0] : __DIR__ . '/../plugin/silexgis-caveview-3d/includes/shortcode.php';

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

if ( ! function_exists( 'silex_ce_config_address_faults' ) ) {
	check( 'the configuration helpers judge the addresses a configuration names', false, 'silex_ce_config_address_faults() is not defined' );
	echo "\n1 failed\n";
	exit( 1 );
}

/* ---- one path at a time ------------------------------------------------------------------ */

$paths = array(
	// value, allowed?
	array( '/wp-content/plugins/silexgis-caveview-3d/vendor/caveview/2.9.0-slx.25/', true ),
	array( '/caves/pictures/thumbnails/', true ),
	array( '/wp-json/silexgis-caveview/v1/', true ),
	array( '/a', true ),
	array( '/caves/my pictures/', true ),                    // a space is odd, and stays on this site
	array( 'https://attacker.example/x/', false ),
	array( 'http://attacker.example/x/', false ),
	array( '//attacker.example/x/', false ),                 // protocol-relative
	array( '/\\attacker.example/x/', false ),                // browsers read "/\" as "//"
	array( '\\\\attacker.example/x/', false ),
	array( "/\t/attacker.example/x/", false ),               // the tab is dropped before the address is read
	array( "/\n/attacker.example/x/", false ),
	array( '/', false ),                                     // "/" + "/x" is "//x"
	array( '', false ),
	array( 'caves/pictures/', false ),                       // relative to the page, not to the site
	array( './caves/', false ),
	array( 'javascript:alert(1)//', false ),
	array( 'data:text/css,body{}', false ),
	array( '/caves/../../x/', false ),
	array( '/caves/..', false ),
	array( '/caves/%2e%2e/x/', false ),
	array( '/caves/.%2E/x/', false ),
	array( '/caves//pictures/', false ),
	array( '/redirect?to=//attacker.example/', false ),
	array( '/caves/a\\b/', false ),
	array( "/caves/\x00/", false ),
	array( ' /caves/', false ),                              // does not begin with the slash
	array( '/caves/..hidden/', true ),                       // two dots inside a name are not a segment
	array( '/caves/a..b/', true ),
);
foreach ( $paths as $case ) {
	list( $value, $allowed ) = $case;
	$got = silex_ce_is_site_path( $value );
	check( 'path ' . json_encode( $value ) . ( $allowed ? ' is a path on this site' : ' is refused' ), $got === $allowed );
}
foreach ( array( null, false, true, 5, array( '/caves/' ), (object) array( 'a' => '/caves/' ) ) as $value ) {
	check( 'a ' . gettype( $value ) . ' is not a path', false === silex_ce_is_site_path( $value ) );
}

$names = array(
	array( 'P8_Master.3d', true ),
	array( '2025/model.lox', true ),
	array( 'model v2.lox', true ),
	array( '/attacker.example/x.lox', false ),               // joined onto "/…": a leading slash can make "//"
	array( '//attacker.example/x.lox', false ),
	array( 'https://attacker.example/x.lox', false ),
	array( '\\attacker.example\\x.lox', false ),
	array( '../../wp-config.php', false ),
	array( 'a/../../x.lox', false ),
	array( '', false ),
);
foreach ( $names as $case ) {
	list( $value, $allowed ) = $case;
	check( 'name ' . json_encode( $value ) . ( $allowed ? ' is a file name beneath a directory' : ' is refused' ), silex_ce_is_name_beneath( $value ) === $allowed );
}

/* ---- whole configurations ----------------------------------------------------------------- */

function faults_of( $json ) {
	$parsed = silex_ce_parse_config( $json );
	if ( ! isset( $parsed['config'] ) ) {
		return array( '(not JSON)' );
	}

	return silex_ce_config_address_faults( $parsed['config'] );
}
$A = 'https://attacker.example/x/';
$configs = array(
	// name, JSON, the fields that must be named (exactly)
	array( 'an empty configuration', '{}', array() ),
	array( 'no address field at all', '{"container":"cave_model","placeList":"p","places":[{"label":"https://not-an-address.example/","station":"a.b"}]}', array() ),
	array( 'every address on this site', '{"home":"/v/","surveyDirectory":"/s/","terrainDirectory":"/t/","survey":"a.lox","language":"ro","pictures":{"root":"/p/","thumbnails":"/p/t/","byStation":{}},"trips":{"source":{"base":"/wp-json/silexgis-caveview/v1/","slots":["a-1"]}}}', array() ),
	array( 'an absolute home', '{"home":' . json_encode( $A ) . '}', array( 'home' ) ),
	array( 'every address absolute', '{"home":"' . $A . '","surveyDirectory":"' . $A . '","terrainDirectory":"' . $A . '","pictures":{"root":"' . $A . '","thumbnails":"' . $A . '"},"trips":{"source":{"base":"' . $A . '"}}}',
		array( 'home', 'surveyDirectory', 'terrainDirectory', 'pictures.root', 'pictures.thumbnails', 'trips.source.base' ) ),
	array( 'a protocol-relative pictures.root', '{"pictures":{"root":"//attacker.example/p/","thumbnails":"/p/t/"}}', array( 'pictures.root' ) ),
	array( 'a list where home is expected (it would be joined into an absolute address)', '{"home":["' . $A . '"]}', array( 'home' ) ),
	array( 'null where home is expected', '{"home":null}', array( 'home' ) ),
	array( 'a number where surveyDirectory is expected', '{"surveyDirectory":5}', array( 'surveyDirectory' ) ),
	array( 'a lone slash as surveyDirectory', '{"surveyDirectory":"/","survey":"a.lox"}', array( 'surveyDirectory' ) ),
	array( 'a survey that begins with a slash', '{"surveyDirectory":"/s/","survey":"/attacker.example/a.lox"}', array( 'survey' ) ),
	array( 'a list of surveys, one of them absolute', '{"survey":["a.lox","https://attacker.example/b.lox"]}', array( 'survey' ) ),
	array( 'a list of surveys on this site', '{"survey":["a.lox","b/c.lox"]}', array() ),
	array( 'an object where survey is expected', '{"survey":{"name":"a.lox"}}', array( 'survey' ) ),
	array( 'a language that is a path', '{"language":"../../../../wp-admin/admin-ajax.php?action=x&"}', array( 'language' ) ),
	array( 'no language (null, false, empty)', '{"language":null,"x":{"language":false}}', array() ),
	array( 'a language code', '{"language":"pt-BR"}', array() ),
	array( 'pictures.root handed over through a prototype', '{"pictures":{"__proto__":{"root":"' . $A . '"},"byStation":{}}}', array( 'pictures.__proto__' ) ),
	array( 'trips.source.base handed over through a prototype', '{"trips":{"source":{"__proto__":{"base":"' . $A . '"}}}}', array( 'trips.source.__proto__' ) ),
	array( 'a __proto__ key spelled with an escape, inside a list', '{"places":[{"label":"a"},{"\\u005f_proto__":{}}]}', array( 'places[1].__proto__' ) ),
	array( 'a __proto__ key at the top', '{"__proto__":{"home":"' . $A . '"}}', array( '__proto__' ) ),
	array( 'the same key twice: the last one is what is stored, and what is judged', '{"home":"/v/","home":"' . $A . '"}', array( 'home' ) ),
	array( 'pictures as a list (it has no root)', '{"pictures":[{"root":"' . $A . '"}]}', array() ),
	array( 'trips.source as a text (it has no base)', '{"trips":{"source":"' . $A . '"}}', array() ),
);
foreach ( $configs as $case ) {
	list( $name, $json, $expected ) = $case;
	$got = faults_of( $json );
	check( $name . ': ' . ( $expected ? 'refused for ' . implode( ', ', $expected ) : 'accepted' ), $got === $expected, 'got ' . json_encode( $got ) );
}

// What the page would be told, and what a person would: both name the field, neither quotes the address.
$f = faults_of( '{"home":"' . $A . '","pictures":{"root":"' . $A . '"}}' );
$console = silex_ce_config_fault_console( $f );
$person  = silex_ce_config_fault_text( $f );
check( 'the console text names the refused fields and not the address', false !== strpos( $console, 'home, pictures.root' ) && false === strpos( $console, 'attacker' ) );
check( 'the text for a person names the refused fields and not the address', false !== strpos( $person, 'home, pictures.root' ) && false === strpos( $person, 'attacker' ) );

// A configuration with thousands of __proto__ keys is refused without naming them all.
$many = '{' . implode( ',', array_map( function ( $i ) { return '"k' . $i . '":{"__proto__":{}}'; }, range( 1, 3000 ) ) ) . '}';
$got  = faults_of( $many );
check( 'many __proto__ keys: refused, and at most a handful named', count( $got ) >= 1 && count( $got ) <= 8, count( $got ) . ' named' );

/* ---- the example configuration ---------------------------------------------------------- */

$example = file_get_contents( __DIR__ . '/../examples/page-config-paths.json' );
$parsed  = silex_ce_parse_config( $example );
check( 'the example configuration is JSON', isset( $parsed['config'] ) );
$got = isset( $parsed['config'] ) ? silex_ce_config_address_faults( $parsed['config'] ) : array( '(not JSON)' );
check( 'the example configuration passes as it is', array() === $got, count( $got ) . ' fields refused: ' . implode( ', ', $got ) );
$fields = silex_ce_config_address_fields();
$present = 0;
foreach ( $fields['paths'] as $path ) {
	list( $found ) = silex_ce_config_field( $parsed['config'], $path );
	$present += $found ? 1 : 0;
}
check( 'and the check had something to judge in it (at least four address fields present)', $present >= 4, $present . ' present' );
check( 'stored and read back, it is the same configuration', json_encode( json_decode( silex_ce_config_to_string( $parsed['config'] ) ) ) === json_encode( json_decode( $example ) ) );

if ( $as_json ) {
	echo json_encode( array(
		'fields'  => silex_ce_config_address_fields(),
		'paths'   => array_map( function ( $c ) { return array( $c[0], silex_ce_is_site_path( $c[0] ) ); }, $paths ),
		'names'   => array_map( function ( $c ) { return array( $c[0], silex_ce_is_name_beneath( $c[0] ) ); }, $names ),
		'configs' => array_map( function ( $c ) { return array( $c[0], $c[1], faults_of( $c[1] ) ); }, $configs ),
		'example' => array( $example, $got ),
	) ) . "\n";
	exit( $failed ? 1 : 0 );
}
echo "\n$count checks: " . ( $failed ? "$failed failed" : 'all good' ) . "\n";
exit( $failed ? 1 : 0 );
