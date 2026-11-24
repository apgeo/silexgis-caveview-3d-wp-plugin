<?php
/**
 * [silexgis_cave] — the container markup, as a shortcode — and a page's configuration.
 *
 * A raw-HTML block survives ordinary edits, but dies to the block editor's "convert to
 * blocks"/"attempt recovery" prompts — the accident that has already happened on this
 * site. A shortcode degrades gracefully: even absorbed into a paragraph, the shortcode
 * TEXT survives and still expands. Registering it also makes wptexturize skip its contents.
 *
 *   [silexgis_cave id="cave_model" places_id="cave_places" config="my-cave"]
 *     Caption text — as enclosed content, because attributes die on curly-quote
 *     substitution and unescaped quotes; prose belongs between the tags.
 *   [/silexgis_cave]
 *
 * Emits exactly the markup the raw-HTML block held, so the component and its stylesheet
 * need no changes. Assets are NOT enqueued from here — the callback runs during
 * the_content, too late for head styles; the wp_enqueue_scripts hook in assets.php
 * detects the shortcode.
 *
 * THE PAGE'S CONFIGURATION
 *
 * The argument of SilexCaveEmbed.create() — which survey, which places, which pictures,
 * which published trips — is a JSON object. A page carries it in one of three ways, in
 * this order of precedence: the file named by the shortcode's config="..." attribute; the
 * post meta _silex_cave_embed_config, kept by the "3D model (SilexCaveEmbed)" box on the
 * page and printed by the enqueue hook as a create() call right after the component (or
 * after the trips module when the configuration has a trips section); the file named by
 * the page's slug, pages/<slug>.js beside the component. The helpers below read and
 * print the meta form; the files are loaded by assets.php.
 *
 * SMALLER SHORTCODES, FOR A JOURNAL
 *
 *   [silexgis_cave_day_trips day="2026-09-14" to="2026-09-17" model="cave_model"]
 *   [silexgis_cave_stats model="cave_model"]
 *   [silexgis_cave_trip_log model="cave_model"]
 *   [silexgis_cave_columns] [silexgis_cave_stats] [silexgis_cave_trip_log] [/silexgis_cave_columns]
 *
 * Each of the first three emits one empty element and nothing else; the component's journal
 * module fills it — with a chip per trip that was in the cave on those days, with the
 * expedition's figures, with a table of every published report. `to` and `model` are
 * optional: one day, and the page's first model. The fourth is only a frame: what stands
 * between its tags is set side by side where the article is wide enough for two columns and
 * one under the other where it is not.
 * A page whose configuration asks for chips under its day headings (`trips.days`) or for
 * the figures at the end of the article (`trips.stats.panel`) needs neither; these are for
 * putting one somewhere in particular. Both come out hidden and are shown by the module
 * once it has something to put in them, so a page without the module shows nothing.
 */

defined( 'ABSPATH' ) || exit;

add_action( 'init', function () {
	add_shortcode( SILEX_CE_SHORTCODE, 'silex_ce_model_shortcode' );
	add_shortcode( 'silexgis_cave_day_trips', 'silex_ce_day_trips_shortcode' );
	add_shortcode( 'silexgis_cave_stats', 'silex_ce_stats_shortcode' );
	add_shortcode( 'silexgis_cave_trip_log', 'silex_ce_trip_log_shortcode' );
	add_shortcode( 'silexgis_cave_columns', 'silex_ce_columns_shortcode' );
} );

/**
 * The attribute naming which model an element is for, or nothing: an id, sanitised as the
 * model's own id is, since it is compared with one.
 */
function silex_ce_for_model_attribute( $model ) {
	$id = preg_replace( '/[^A-Za-z0-9_-]/', '', (string) $model );
	return '' === $id ? '' : ' data-for="' . esc_attr( $id ) . '"';
}

function silex_ce_day_trips_shortcode( $atts ) {
	$a = shortcode_atts( array(
		'day'   => '',
		'to'    => '',
		'model' => '',
	), $atts, 'silexgis_cave_day_trips' );

	// A calendar day and nothing else: the value is compared with dates, and a day that is
	// not one names no trips, so the element is not emitted at all. `\z` and not `$`, which
	// also matches before a line break at the end and would let one into the attribute.
	$shape = '/^\d{4}-\d{2}-\d{2}\z/';
	if ( ! preg_match( $shape, (string) $a['day'] ) ) {
		return '';
	}
	$to = preg_match( $shape, (string) $a['to'] ) ? $a['to'] : '';

	return '<div class="cave_day_trips" data-day="' . esc_attr( $a['day'] ) . '"'
		. ( '' !== $to ? ' data-day-to="' . esc_attr( $to ) . '"' : '' )
		. silex_ce_for_model_attribute( $a['model'] )
		. ' hidden></div>';
}

function silex_ce_stats_shortcode( $atts ) {
	$a = shortcode_atts( array(
		'model' => '',
	), $atts, 'silexgis_cave_stats' );

	return '<div class="cave_stats" data-stats="1"' . silex_ce_for_model_attribute( $a['model'] ) . ' hidden></div>';
}

function silex_ce_trip_log_shortcode( $atts ) {
	$a = shortcode_atts( array(
		'model' => '',
	), $atts, 'silexgis_cave_trip_log' );

	return '<div class="cave_log cave_log--panel" data-trip-log="1"' . silex_ce_for_model_attribute( $a['model'] ) . ' hidden></div>';
}

/**
 * A frame for two or three of the elements above. It adds nothing of its own to what stands
 * between its tags but the element around it: the shortcodes there are expanded as they
 * would be anywhere, and the paragraphs the editor wraps a line of shortcodes in are taken
 * off first, since a paragraph around a box is a column of its own with nothing in it.
 */
function silex_ce_columns_shortcode( $atts, $content = '' ) {
	$inner = shortcode_unautop( (string) $content );
	// A line break or a paragraph mark between two shortcodes is the editor's, not the
	// author's: only whitespace and those stand between the boxes.
	$inner = preg_replace( '#</?p[^>]*>|<br\s*/?>#i', '', $inner );

	return '<div class="cave_columns">' . do_shortcode( $inner ) . '</div>';
}

function silex_ce_model_shortcode( $atts, $content = '' ) {
	$a = shortcode_atts( array(
		'id'        => 'cave_model',
		'places'    => 'on',
		'places_id' => '',
		'height'    => '',
		'width'     => '',
		'class'     => '',
		'config'    => '',   // read by the enqueue hook, not here
	), $atts, SILEX_CE_SHORTCODE );

	// Ids are sanitised, not merely escaped: they end up in getElementById calls and CSS
	// selectors, where escaping is not the same thing as being safe.
	$id  = preg_replace( '/[^A-Za-z0-9_-]/', '', $a['id'] );
	$pid = preg_replace( '/[^A-Za-z0-9_-]/', '', $a['places_id'] ? $a['places_id'] : $id . '_places' );

	// Dimensions are validated against a strict CSS-length shape before they may enter a
	// style attribute; anything else is dropped rather than "escaped".
	$style = '';
	foreach ( array( 'height' => '--cave-embed-height', 'width' => '--cave-embed-width' ) as $k => $var ) {
		if ( $a[ $k ] && preg_match( '/^\d+(\.\d+)?(px|rem|em|vh|vw|%)$/', $a[ $k ] ) ) {
			$style .= $var . ':' . $a[ $k ] . ';';
		}
	}

	$out = '<div class="cave_embed' . ( $a['class'] ? ' ' . esc_attr( $a['class'] ) : '' ) . '"'
		. ( $style ? ' style="' . esc_attr( $style ) . '"' : '' ) . '>';
	if ( 'off' !== $a['places'] ) {
		$out .= '<div class="cave_embed_places" id="' . esc_attr( $pid ) . '"></div>';
	}
	$out .= '<div class="cave_embed_model" id="' . esc_attr( $id ) . '"></div></div>';

	if ( '' !== trim( (string) $content ) ) {
		$out .= '<p class="cave_embed_caption">' . wp_kses_post( $content ) . '</p>';
	}

	return $out;
}

/* ---- the configuration held in post meta -------------------------------------------- */

/**
 * The configuration stored on a post: the decoded object, null when the post holds none,
 * false when it holds something that is not a JSON object (so the caller can say so).
 */
function silex_ce_page_config( $post_id ) {
	$stored = get_post_meta( $post_id, SILEX_CE_META_KEY, true );
	if ( ! is_string( $stored ) || '' === trim( $stored ) ) {
		return null;
	}
	$parsed = silex_ce_parse_config( $stored );

	return isset( $parsed['config'] ) ? $parsed['config'] : false;
}

/**
 * The create() call for a configuration, as the inline script printed after the
 * component. The object is encoded with "<" and ">" as escape sequences besides the
 * default escaping of "/", so no string inside it can end the script element early
 * however it is spelled.
 */
function silex_ce_create_script( $config ) {
	return 'window.SilexCaveEmbed.create(' . wp_json_encode( $config, JSON_HEX_TAG ) . ');';
}

/**
 * A configuration as typed: either array( 'config' => object ) or array( 'error' => text ).
 *
 * json_decode() decides validity. It is decoded to objects rather than arrays so that an
 * empty {} stays an object when printed back — the component's byStation table is one,
 * and [] in its place would be a different thing.
 */
function silex_ce_parse_config( $raw ) {
	$raw = (string) $raw;
	// An empty text is refused as "not an object" rather than as "the text ended at line 1,
	// column 1": the callers clear the meta on an empty box before asking, so this is only
	// ever reached by a tool, and the message that names the shape is the useful one.
	if ( '' === trim( $raw ) ) {
		return array( 'error' => __( 'the configuration must be a JSON object: it begins with { and ends with }', 'silexgis-caveview-3d' ) );
	}
	$decoded = json_decode( $raw );
	if ( null === $decoded && JSON_ERROR_NONE !== json_last_error() ) {
		return array( 'error' => silex_ce_json_fault( $raw, json_last_error_msg() ) );
	}
	if ( ! is_object( $decoded ) ) {
		return array( 'error' => __( 'the configuration must be a JSON object: it begins with { and ends with }', 'silexgis-caveview-3d' ) );
	}

	return array( 'config' => $decoded );
}

/** The stored form of a configuration: its JSON, laid out for the person who will edit it next. */
function silex_ce_config_to_string( $config ) {
	return wp_json_encode( $config, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES );
}

/* ---- the addresses a configuration may name ------------------------------------------ */

/**
 * The fields of a configuration that the component turns into requests, by what each is.
 *
 * 'paths' are directories it requests from as they stand: the viewer's stylesheet and
 * language catalogue under home, the model under surveyDirectory, the terrain under
 * terrainDirectory, the pictures and their thumbnails, the trips proxy. 'names' are joined
 * onto one of those without being encoded: the survey's file name — one, or a list of
 * them — onto surveyDirectory. 'codes' become part of a file name: the language, in
 * <home>lib/lang-<code>.json. Picture names and trip slots are not listed, because the
 * component percent-encodes them and so they cannot leave their directory.
 *
 * A configuration printed on a page becomes requests in every reader's browser, and a
 * stylesheet among them. WordPress lets only a user with unfiltered_html put a <link> or
 * a <script> into a page; a configuration that could name another host would be the same
 * thing by another door. So these fields stay on this site, whoever wrote them.
 */
function silex_ce_config_address_fields() {
	return array(
		'paths' => array( 'home', 'surveyDirectory', 'terrainDirectory', 'pictures.root', 'pictures.thumbnails', 'trips.source.base' ),
		'names' => array( 'survey' ),
		'codes' => array( 'language' ),
	);
}

/**
 * A path on this site, as a configuration may name a directory: one leading slash with
 * something other than a slash or a backslash after it, and nowhere in it a "//", a
 * backslash, a control character or a ".." segment, spelled out or percent-encoded.
 *
 * Each clause closes a way for the text to be read as another host's address: "//host/"
 * and "/\host/" name a host, a tab or a newline inside "/<tab>/host/" is dropped by the
 * browser before it reads the address, and a lone "/" becomes "//…" as soon as something
 * that itself begins with a slash is joined onto it — which the viewer does with the
 * terrain directory and with a survey's name. A scheme needs no clause of its own, since
 * nothing that begins with a slash has one.
 */
function silex_ce_is_site_path( $value ) {
	return is_string( $value )
		&& 1 === preg_match( '~^/[^/\\\\]~', $value )
		&& false === strpos( $value, '//' )
		&& 0 === preg_match( '~[\\\\\x00-\x1F\x7F]~', $value )
		&& 0 === preg_match( '~(?:^|/)(?:\.|%2e){2}(?:[/?#]|$)~i', $value );
}

/**
 * A file name beneath a directory, as a configuration names a survey: it is joined onto
 * the directory as it stands, so it may not begin with a slash, carry a scheme, or climb
 * out with "..", and the same characters are refused in it as in a path.
 */
function silex_ce_is_name_beneath( $value ) {
	return is_string( $value )
		&& '' !== $value
		&& 0 === preg_match( '~^(?:/|[A-Za-z][A-Za-z0-9+.-]*:)~', $value )
		&& false === strpos( $value, '//' )
		&& 0 === preg_match( '~[\\\\\x00-\x1F\x7F]~', $value )
		&& 0 === preg_match( '~(?:^|/)(?:\.|%2e){2}(?:[/?#]|$)~i', $value );
}

/** The value at a dotted path of a configuration: array( found, value ). Only objects are walked into. */
function silex_ce_config_field( $config, $path ) {
	$at = $config;
	foreach ( explode( '.', $path ) as $key ) {
		if ( ! is_object( $at ) || ! property_exists( $at, $key ) ) {
			return array( false, null );
		}
		$at = $at->$key;
	}

	return array( true, $at );
}

/**
 * The fields a configuration must be refused for, by name; an empty list when it may be
 * stored and printed. A field that is absent is fine — the component has a default on
 * this site for each — and one that is present must have the shape of what it is.
 *
 * A key named __proto__, anywhere, is refused as well. The configuration is printed as a
 * JavaScript object literal, and there that one key is not a field: it becomes the
 * object's prototype, so { "pictures": { "__proto__": { "root": … } } } would hand the
 * component a pictures.root that no check of pictures.root ever saw.
 */
function silex_ce_config_address_faults( $config ) {
	$faults = array();
	$fields = silex_ce_config_address_fields();

	foreach ( $fields['paths'] as $path ) {
		list( $found, $value ) = silex_ce_config_field( $config, $path );
		if ( $found && ! silex_ce_is_site_path( $value ) ) {
			$faults[] = $path;
		}
	}
	foreach ( $fields['names'] as $path ) {
		list( $found, $value ) = silex_ce_config_field( $config, $path );
		if ( ! $found ) {
			continue;
		}
		foreach ( is_array( $value ) ? $value : array( $value ) as $name ) {
			if ( ! silex_ce_is_name_beneath( $name ) ) {
				$faults[] = $path;
				break;
			}
		}
	}
	foreach ( $fields['codes'] as $path ) {
		list( $found, $value ) = silex_ce_config_field( $config, $path );
		// Nothing, false and an empty text all mean "no catalogue", and ask for no file.
		if ( $found && null !== $value && false !== $value && '' !== $value
			&& ! ( is_string( $value ) && 1 === preg_match( '~^[A-Za-z0-9_-]+$~D', $value ) ) ) {
			$faults[] = $path;
		}
	}
	silex_ce_config_proto_keys( $config, '', $faults );

	return $faults;
}

/** Adds to $faults the place of every key named __proto__, however deep; at most a handful are named. */
function silex_ce_config_proto_keys( $value, $path, &$faults ) {
	if ( count( $faults ) >= 8 ) {
		return;
	}
	if ( is_object( $value ) ) {
		foreach ( get_object_vars( $value ) as $key => $child ) {
			$here = ( '' === $path ) ? (string) $key : $path . '.' . $key;
			if ( '__proto__' === (string) $key ) {
				$faults[] = strlen( $here ) > 120 ? '…' . substr( $here, -100 ) : $here;
				continue;
			}
			silex_ce_config_proto_keys( $child, $here, $faults );
		}
	} elseif ( is_array( $value ) ) {
		foreach ( $value as $i => $child ) {
			silex_ce_config_proto_keys( $child, $path . '[' . $i . ']', $faults );
		}
	}
}

/** Why a configuration was refused, for a person: the fields, then the rule, in the admin screens' language. */
function silex_ce_config_fault_text( $faults ) {
	$fields = silex_ce_config_address_fields();

	return sprintf(
		/* translators: 1: the refused fields, 2: the fields that hold an address */
		__( 'these fields break the rule for addresses: %1$s. An address (%2$s) is a path on this site — it begins with a single “/” and contains no host or scheme (https://…), no “//”, no “\\” and no “..”; survey is a file name in surveyDirectory, language is a language code, and no key may be named __proto__', 'silexgis-caveview-3d' ),
		implode( ', ', $faults ),
		implode( ', ', $fields['paths'] )
	);
}

/** The same, for the browser console of the page the configuration was not printed on. */
function silex_ce_config_fault_console( $faults ) {
	$fields = silex_ce_config_address_fields();

	return 'these fields break the rule for addresses: ' . implode( ', ', $faults )
		. '. An address (' . implode( ', ', $fields['paths'] ) . ') is a path on this site — it begins with a single "/"'
		. ' and holds no host or scheme, no "//", no backslash and no ".."; survey is a file name beneath'
		. ' surveyDirectory, language is a language code, and no key may be named __proto__';
}

/* ---- where a text stops being JSON -------------------------------------------------- */

/**
 * json_decode() says only that it failed; somebody looking at four hundred lines of
 * configuration needs the line. This walks the text as JSON and names the first place it
 * cannot read, with a reason, as "line L, column C: ...". It never decides validity —
 * json_decode() does, and this runs only after it has refused — so a text the walk
 * accepts but json_decode() refused (nesting beyond its limit, invalid UTF-8) is reported
 * at the end of the text with json_decode()'s own message.
 */
function silex_ce_json_fault( $text, $decode_message ) {
	$s = array( 'text' => $text, 'pos' => 0, 'len' => strlen( $text ), 'reason' => '' );
	silex_ce_json_skip_space( $s );
	if ( silex_ce_json_value( $s ) ) {
		silex_ce_json_skip_space( $s );
		if ( $s['pos'] >= $s['len'] ) {
			return silex_ce_json_place( $s, $decode_message );
		}
		$s['reason'] = __( 'text after the end of the value', 'silexgis-caveview-3d' );
	}

	return silex_ce_json_place( $s, $s['reason'] );
}

function silex_ce_json_place( $s, $reason ) {
	$before = substr( $s['text'], 0, $s['pos'] );
	$line   = substr_count( $before, "\n" ) + 1;
	$nl     = strrpos( $before, "\n" );
	$column = mb_strlen( false === $nl ? $before : substr( $before, $nl + 1 ), 'UTF-8' ) + 1;

	/* translators: 1: line number, 2: column number, 3: what was found there */
	return sprintf( __( 'line %1$d, column %2$d: %3$s', 'silexgis-caveview-3d' ), $line, $column, $reason );
}

/** What stands at the current position, shortened, for a message that quotes it. */
function silex_ce_json_glimpse( $s ) {
	$rest  = substr( $s['text'], $s['pos'] );
	$parts = preg_split( '/\r\n|\r|\n/', $rest, 2 );
	$line  = $parts[0];
	$short = mb_substr( $line, 0, 12, 'UTF-8' );

	return mb_strlen( $line, 'UTF-8' ) > 12 ? $short . '…' : $short;
}

/** The reason for refusing what stands at the current position, naming the usual slips by name. */
function silex_ce_json_unexpected( $s, $expected ) {
	$next = substr( $s['text'], $s['pos'], 2 );
	if ( '//' === $next || '/*' === $next ) {
		return __( 'a comment — JSON allows no comments; delete it', 'silexgis-caveview-3d' );
	}
	if ( '' !== $next && "'" === $next[0] ) {
		return __( 'single quotes — JSON needs double quotes (")', 'silexgis-caveview-3d' );
	}
	if ( '' !== $next && ',' === $next[0] ) {
		return __( 'an extra comma', 'silexgis-caveview-3d' );
	}

	/* translators: 1: what was expected, 2: what was found instead */
	return sprintf( __( '%1$s, but here there is “%2$s”', 'silexgis-caveview-3d' ), $expected, silex_ce_json_glimpse( $s ) );
}

function silex_ce_json_skip_space( &$s ) {
	while ( $s['pos'] < $s['len'] && false !== strpos( " \t\r\n", $s['text'][ $s['pos'] ] ) ) {
		$s['pos']++;
	}
}

function silex_ce_json_value( &$s ) {
	if ( $s['pos'] >= $s['len'] ) {
		$s['reason'] = __( 'a value was expected, but the text ended', 'silexgis-caveview-3d' );
		return false;
	}
	$c = $s['text'][ $s['pos'] ];
	switch ( $c ) {
		case '{':
			return silex_ce_json_object( $s );
		case '[':
			return silex_ce_json_array( $s );
		case '"':
			return silex_ce_json_string( $s );
		case 't':
			return silex_ce_json_literal( $s, 'true' );
		case 'f':
			return silex_ce_json_literal( $s, 'false' );
		case 'n':
			return silex_ce_json_literal( $s, 'null' );
	}
	if ( '-' === $c || ctype_digit( $c ) ) {
		return silex_ce_json_number( $s );
	}
	$s['reason'] = silex_ce_json_unexpected( $s, __( 'a value was expected', 'silexgis-caveview-3d' ) );

	return false;
}

function silex_ce_json_literal( &$s, $word ) {
	if ( substr( $s['text'], $s['pos'], strlen( $word ) ) === $word ) {
		$s['pos'] += strlen( $word );
		return true;
	}
	$s['reason'] = silex_ce_json_unexpected( $s, __( 'a value was expected', 'silexgis-caveview-3d' ) );

	return false;
}

function silex_ce_json_number( &$s ) {
	if ( preg_match( '/-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/A', $s['text'], $m, 0, $s['pos'] ) ) {
		$s['pos'] += strlen( $m[0] );
		return true;
	}
	$s['reason'] = __( 'a number written wrongly', 'silexgis-caveview-3d' );

	return false;
}

function silex_ce_json_string( &$s ) {
	$p = $s['pos'] + 1;   // past the opening quote
	while ( $p < $s['len'] ) {
		$c = $s['text'][ $p ];
		if ( '"' === $c ) {
			$s['pos'] = $p + 1;
			return true;
		}
		if ( '\\' === $c ) {
			$e = $p + 1 < $s['len'] ? $s['text'][ $p + 1 ] : '';
			if ( 'u' === $e ) {
				if ( ! preg_match( '/[0-9A-Fa-f]{4}/A', $s['text'], $m, 0, $p + 2 ) ) {
					$s['pos']    = $p;
					$s['reason'] = __( 'an incomplete \u sequence — it needs four hexadecimal digits', 'silexgis-caveview-3d' );
					return false;
				}
				$p += 6;
				continue;
			}
			if ( '' === $e || false === strpos( '"\\/bfnrt', $e ) ) {
				$s['pos']    = $p;
				$s['reason'] = __( 'an unknown escape sequence after \\', 'silexgis-caveview-3d' );
				return false;
			}
			$p += 2;
			continue;
		}
		if ( ord( $c ) < 0x20 ) {
			$s['pos']    = $p;
			$s['reason'] = ( "\n" === $c || "\r" === $c )
				? __( 'a string left open at the end of the line — is the closing quote missing?', 'silexgis-caveview-3d' )
				: __( 'a control character inside a string', 'silexgis-caveview-3d' );
			return false;
		}
		$p++;
	}
	$s['pos']    = $p;
	$s['reason'] = __( 'a string that is never closed', 'silexgis-caveview-3d' );

	return false;
}

function silex_ce_json_object( &$s ) {
	$s['pos']++;   // {
	silex_ce_json_skip_space( $s );
	if ( $s['pos'] < $s['len'] && '}' === $s['text'][ $s['pos'] ] ) {
		$s['pos']++;
		return true;
	}
	while ( true ) {
		silex_ce_json_skip_space( $s );
		if ( $s['pos'] >= $s['len'] || '"' !== $s['text'][ $s['pos'] ] ) {
			$s['reason'] = ( $s['pos'] < $s['len'] && '}' === $s['text'][ $s['pos'] ] )
				? __( 'an extra comma before }', 'silexgis-caveview-3d' )
				: silex_ce_json_unexpected( $s, __( 'a property name, in double quotes, was expected', 'silexgis-caveview-3d' ) );
			return false;
		}
		if ( ! silex_ce_json_string( $s ) ) {
			return false;
		}
		silex_ce_json_skip_space( $s );
		if ( $s['pos'] >= $s['len'] || ':' !== $s['text'][ $s['pos'] ] ) {
			$s['reason'] = silex_ce_json_unexpected( $s, __( 'a “:” was expected after the property name', 'silexgis-caveview-3d' ) );
			return false;
		}
		$s['pos']++;
		silex_ce_json_skip_space( $s );
		if ( ! silex_ce_json_value( $s ) ) {
			return false;
		}
		silex_ce_json_skip_space( $s );
		if ( $s['pos'] >= $s['len'] ) {
			$s['reason'] = __( 'an object that is never closed — the } is missing', 'silexgis-caveview-3d' );
			return false;
		}
		$c = $s['text'][ $s['pos'] ];
		if ( '}' === $c ) {
			$s['pos']++;
			return true;
		}
		if ( ',' !== $c ) {
			$s['reason'] = silex_ce_json_unexpected( $s, __( 'a “,” or a “}” was expected', 'silexgis-caveview-3d' ) );
			return false;
		}
		$s['pos']++;
	}
}

function silex_ce_json_array( &$s ) {
	$s['pos']++;   // [
	silex_ce_json_skip_space( $s );
	if ( $s['pos'] < $s['len'] && ']' === $s['text'][ $s['pos'] ] ) {
		$s['pos']++;
		return true;
	}
	while ( true ) {
		silex_ce_json_skip_space( $s );
		if ( $s['pos'] < $s['len'] && ']' === $s['text'][ $s['pos'] ] ) {
			$s['reason'] = __( 'an extra comma before ]', 'silexgis-caveview-3d' );
			return false;
		}
		if ( ! silex_ce_json_value( $s ) ) {
			return false;
		}
		silex_ce_json_skip_space( $s );
		if ( $s['pos'] >= $s['len'] ) {
			$s['reason'] = __( 'a list that is never closed — the ] is missing', 'silexgis-caveview-3d' );
			return false;
		}
		$c = $s['text'][ $s['pos'] ];
		if ( ']' === $c ) {
			$s['pos']++;
			return true;
		}
		if ( ',' !== $c ) {
			$s['reason'] = silex_ce_json_unexpected( $s, __( 'a “,” or a “]” was expected', 'silexgis-caveview-3d' ) );
			return false;
		}
		$s['pos']++;
	}
}
