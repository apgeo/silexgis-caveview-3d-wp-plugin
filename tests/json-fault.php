<?php
/**
 * The JSON fault locator, driven with the slips people actually make when they paste a
 * configuration: a comment copied from the JavaScript file, single quotes, a trailing
 * comma, a missing colon, a string left open, a list where an object was wanted. Each
 * case asserts the line and column named, and that valid JSON comes back as an object.
 *
 * Twice: as the code says it, in English, and as a site in Romanian says it, with the
 * plugin's own languages/silexgis-caveview-3d-ro_RO.l10n.php — the file WordPress 6.5 and later
 * read — loaded under the translation functions, so the Romanian is held to the same places.
 *
 *   docker run --rm -v "$PWD":/w:ro php:7.4-cli php /w/tests/json-fault.php
 */
define( 'ABSPATH', '/nonexistent/' );
define( 'SILEX_CE_META_KEY', '_silex_cave_embed_config' );
// The translation in force: none (the code's English), or the messages of one .l10n.php.
$GLOBALS['silex_messages'] = array();
function __( $s ) { return isset( $GLOBALS['silex_messages'][ $s ] ) ? $GLOBALS['silex_messages'][ $s ] : $s; }
function add_action() {}
function add_shortcode() {}
function wp_json_encode( $v, $flags = 0 ) { return json_encode( $v, $flags ); }
function get_post_meta() { return ''; }
if ( ! function_exists( 'mb_strlen' ) ) { function mb_strlen( $s ) { return strlen( $s ); } function mb_substr( $s, $a, $b ) { return substr( $s, $a, $b ); } }

require __DIR__ . '/../plugin/silexgis-caveview-3d/includes/shortcode.php';

$texts = array(
	"{\n\t\"a\": 1,\n\t// comment\n\t\"b\": 2\n}",
	"{ 'a': 1 }",
	"{\n  \"a\": [1, 2,],\n}",   // named at the ] the comma stands before, as the } case is
	"{\n  \"a\": 1,\n}",
	"{ \"a\" 1 }",
	"{ \"a\": \"abc\n}",
	"{ \"a\": 1 } x",
	"{ \"a\": 1 \"b\": 2 }",
	"{ \"a\": tru }",
	"{ \"a\": -x }",
	"{ \"a\": \"\\q\" }",
	"{ \"ș\": 1, \"b\" }",
	"[1, 2]",
	"\"text\"",
	"",
	"{ \"a\": [1, {\"b\": null}], \"c\": \"ș\\u0219\" }",
	"{}",
);
// For each text, in order: the place named (null for none) and a fragment of the reason, per language.
$expected = array(
	'en' => array(
		array( 'line 3, column 2', 'a comment' ),
		array( 'line 1, column 3', 'single quotes' ),
		array( 'line 2, column 14', 'an extra comma before ]' ),
		array( 'line 3, column 1', 'an extra comma before }' ),
		array( 'line 1, column 7', '“:”' ),
		array( 'line 1, column 12', 'left open' ),
		array( 'line 1, column 12', 'after the end' ),
		array( 'line 1, column 10', '“,” or a “}”' ),
		array( 'line 1, column 8', 'a value was expected' ),
		array( 'line 1, column 8', 'number' ),
		array( 'line 1, column 9', 'escape' ),
		array( 'line 1, column 15', '“:”' ),
		array( null, 'JSON object' ),
		array( null, 'JSON object' ),
		array( null, 'JSON object' ),
		array( null, null ),
		array( null, null ),
	),
	'ro' => array(
		array( 'linia 3, coloana 2', 'comentariu' ),
		array( 'linia 1, coloana 3', 'ghilimele simple' ),
		array( 'linia 2, coloana 14', 'virgulă în plus înainte de ]' ),
		array( 'linia 3, coloana 1', 'virgulă în plus înainte de }' ),
		array( 'linia 1, coloana 7', '„:”' ),
		array( 'linia 1, coloana 12', 'neînchis' ),
		array( 'linia 1, coloana 12', 'după sfârșitul' ),
		array( 'linia 1, coloana 10', '„,” sau „}”' ),
		array( 'linia 1, coloana 8', 'se aștepta o valoare' ),
		array( 'linia 1, coloana 8', 'număr' ),
		array( 'linia 1, coloana 9', 'evadare' ),
		array( 'linia 1, coloana 15', '„:”' ),
		array( null, 'obiect JSON' ),
		array( null, 'obiect JSON' ),
		array( null, 'obiect JSON' ),
		array( null, null ),
		array( null, null ),
	),
);

$failed = 0;
$l10n   = __DIR__ . '/../plugin/silexgis-caveview-3d/languages/silexgis-caveview-3d-ro_RO.l10n.php';
foreach ( $expected as $language => $cases ) {
	$GLOBALS['silex_messages'] = array();
	if ( 'ro' === $language ) {
		$file = is_readable( $l10n ) ? include $l10n : null;
		$ok   = is_array( $file ) && 'ro_RO' === $file['language'] && is_array( $file['messages'] ) && count( $file['messages'] ) > 0;
		echo ( $ok ? 'ok    ' : 'FAIL  ' ) . "the Romanian translation loads as WordPress loads it: an array with the language and its messages\n";
		if ( ! $ok ) { $failed++; continue; }
		$GLOBALS['silex_messages'] = $file['messages'];
	}
	foreach ( $cases as $i => $case ) {
		list( $where, $reason ) = $case;
		$r = silex_ce_parse_config( $texts[ $i ] );
		if ( null === $reason ) {
			$ok = isset( $r['config'] ) && is_object( $r['config'] );
			echo ( $ok ? 'ok    ' : 'FAIL  ' ) . "$language case $i: valid object" . ( $ok ? '' : ' — ' . json_encode( $r ) ) . "\n";
		} else {
			$msg = isset( $r['error'] ) ? $r['error'] : '(accepted)';
			$ok  = isset( $r['error'] ) && ( null === $where || 0 === strpos( $msg, $where ) ) && false !== strpos( $msg, $reason );
			echo ( $ok ? 'ok    ' : 'FAIL  ' ) . "$language case $i: " . ( $where ? $where : 'refused' ) . ", $reason" . ( $ok ? '' : " — got: $msg" ) . "\n";
		}
		if ( ! $ok ) { $failed++; }
	}
}
$GLOBALS['silex_messages'] = array();
// The stored form reads back as the same object, and {} stays an object.
$r = silex_ce_parse_config( '{"byStation": {}, "list": [], "n": 1.5, "s": "a/b<c>"}' );
$again = silex_ce_parse_config( silex_ce_config_to_string( $r['config'] ) );
$ok = isset( $again['config'] ) && json_encode( $again['config'] ) === json_encode( $r['config'] ) && is_object( $again['config']->byStation ) && is_array( $again['config']->list );
echo ( $ok ? 'ok    ' : 'FAIL  ' ) . "stored form reads back equal, {} stays an object, [] stays a list\n";
if ( ! $ok ) { $failed++; }
$script = silex_ce_create_script( $r['config'] );
$ok = 0 === strpos( $script, 'window.SilexCaveEmbed.create({' ) && false === strpos( $script, '<' ) && false === strpos( $script, '>' ) && ');' === substr( $script, -2 );
echo ( $ok ? 'ok    ' : 'FAIL  ' ) . "create() script carries no raw < or >\n";
if ( ! $ok ) { $failed++; }
echo "\n" . ( $failed ? "$failed failed" : 'all good' ) . "\n";
exit( $failed ? 1 : 0 );
