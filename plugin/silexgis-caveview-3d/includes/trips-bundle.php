<?php
/**
 * The cave's finished trips, kept by this site: written here from the installation, every few
 * minutes and on demand, into one file a page reads as it opens.
 *
 * WHY A COPY, AND WHY THIS ONE
 *
 * A page about an expedition draws its list, its replays, its day chips and its figures from the
 * cave's finished trips. Asked one by one through the proxy beside this file, that is a list and
 * a track per trip — some thirty requests before the figures can be counted, each a PHP process
 * and a read of somebody else's server — and none of it can be drawn while the installation is
 * down for an hour or moved for good. So the page reads one file instead, written ahead of time:
 * the list and every track, exactly as the installation's published routes answered them, with
 * the photographs and the map sheets those answers pointed at stored beside it. A web server
 * hands that file over as fast as any other, and the page then asks the installation for what
 * the file cannot know — whoever is underground now, trips finished since it was written.
 *
 * Until now the file was written by hand, with a tool, after each change on the installation.
 * This writes it here instead, from the links the site already holds, so a change made on the
 * installation reaches the page within minutes and nobody has to remember anything.
 *
 * WHAT IS IN IT
 *
 * Exactly what the published routes answer, as the proxy relays it: the installation decides
 * what a trip may say about its party, and nothing here edits that. Three things are changed on
 * the way, all of them addresses. A picture's address opens it for some minutes, so each
 * picture is fetched while it does, stored under media/, and the address becomes that file's —
 * a small rendering as `thumbnailUrl` and a larger one as `url` — and a map sheet's picture the
 * same way, as `imageUrl`. Every other signed address is dropped, as the proxy drops it.
 *
 * WHEN THE INSTALLATION DOES NOT ANSWER
 *
 * The file is left as it is. That is the whole of the cache: the last copy that could be written
 * stays the page's until a new one can be, however long that takes, and the page says so where
 * the site's settings ask it to. A track that cannot be read this time keeps its last copy; a trip
 * that has left the installation's list leaves the file with it.
 *
 * WHAT IT COSTS THE INSTALLATION
 *
 * One list per cave every five minutes, and a track only where it changed: each track is asked
 * with the validator its last answer carried, and an unchanged one is answered "not modified"
 * with no body. A picture is fetched once — it is kept under a name made from its address
 * without the signature — and never again while that file exists.
 */

defined( 'ABSPATH' ) || exit;

/** The scheduled event that writes every cave's file. */
const SILEX_CE_BUNDLE_HOOK = 'silex_ce_refresh_trip_bundles';
/** How often it runs, in seconds — how long a change on the installation takes to reach a page. */
const SILEX_CE_BUNDLE_EVERY = 300;
/** What each cave's last writing did, kept for the settings screen and the page: an option. */
const SILEX_CE_BUNDLE_STATE = 'silex_ce_bundle_state';
/** Whether a page says, when it is drawn from the site's copy, that it is. */
const SILEX_CE_OPTION_CACHE_NOTICE = 'silex_ce_cache_notice';
/** The file's format, the one the page's export source reads. */
const SILEX_CE_BUNDLE_FORMAT = 'silexgis-trips-export/1';
/** How long one read may take when nobody is waiting on it: longer than the proxy's six seconds. */
const SILEX_CE_BUNDLE_TIMEOUT = 20;
/** The longest one writing may run before it stops, keeping the last copy of what it did not reach. */
const SILEX_CE_BUNDLE_BUDGET = 90;
/** The widths the renderings are stored at: a thumbnail, a larger view, a map sheet. */
const SILEX_CE_BUNDLE_SMALL = 480;
const SILEX_CE_BUNDLE_LARGE = 1200;
const SILEX_CE_BUNDLE_SHEET = 2400;

/** Where a cave's file and its pictures live on disk, and the address they are served at. */
function silex_ce_bundle_place( $group ) {
	$uploads = wp_upload_dir( null, false );
	$tail    = '/' . SILEX_CE_UPLOADS_DIR . '/trips/' . $group;
	return array(
		'dir' => $uploads['basedir'] . $tail,
		'url' => set_url_scheme( $uploads['baseurl'] . $tail, 'relative' ),
	);
}

/** The caves the site holds links of, by the group name their slots share. */
function silex_ce_bundle_groups() {
	$cfg    = silex_trips_config();
	$groups = array();
	foreach ( $cfg['slots'] as $slot => $token ) {
		if ( '' !== (string) $token ) {
			$groups[ silex_trips_group( $slot ) ] = true;
		}
	}
	return array_keys( $groups );
}

/** What the last writing of each cave did. */
function silex_ce_bundle_states() {
	$state = get_option( SILEX_CE_BUNDLE_STATE );
	return is_array( $state ) ? $state : array();
}

function silex_ce_bundle_save_state( $group, $state ) {
	$all           = silex_ce_bundle_states();
	$all[ $group ] = $state;
	update_option( SILEX_CE_BUNDLE_STATE, $all, false );
}

/** Whether pages say so when they are drawn from the site's copy. On unless switched off. */
function silex_ce_cache_notice() {
	return '0' !== (string) get_option( SILEX_CE_OPTION_CACHE_NOTICE, '1' );
}

/**
 * What a page is told about the site's copies: each cave's file, and when it was last written —
 * only for a cave whose file exists, so that a page never asks for one that is not there.
 */
function silex_ce_bundle_for_pages() {
	$out    = array();
	$states = silex_ce_bundle_states();
	// With no copy kept, a copy still on disk is no longer being written, and a page that read it
	// would show trips that stopped changing: the pages read the installation through the proxy.
	if ( ! silex_ce_keep_copy() ) {
		return $out;
	}
	foreach ( silex_ce_bundle_groups() as $group ) {
		$place = silex_ce_bundle_place( $group );
		if ( file_exists( $place['dir'] . '/trips.json' ) ) {
			$out[ $group ] = array(
				'url'       => $place['url'] . '/trips.json',
				'writtenAt' => isset( $states[ $group ]['writtenAt'] ) ? $states[ $group ]['writtenAt'] : null,
			);
		}
	}
	return $out;
}

/**
 * One read of the installation for the copy: the answer with its signed addresses still in it,
 * since the pictures are fetched through them, and the validator it carried.
 *
 * `$etag` asks "has it changed?": an unchanged answer comes back as `not-modified` and no body.
 */
function silex_ce_bundle_read( $base, $path, $etag = null ) {
	$headers = array( 'Accept' => 'application/json' );
	if ( $etag ) {
		$headers['If-None-Match'] = $etag;
	}
	$response = wp_remote_get( $base . $path, array(
		'timeout'     => SILEX_CE_BUNDLE_TIMEOUT,
		'redirection' => 0,
		'headers'     => $headers,
	) );
	if ( is_wp_error( $response ) ) {
		return array( 'status' => 0 );
	}
	$code = (int) wp_remote_retrieve_response_code( $response );
	$tag  = (string) wp_remote_retrieve_header( $response, 'etag' );
	if ( 304 === $code ) {
		return array( 'status' => 304, 'etag' => $tag ? $tag : $etag );
	}
	if ( 200 !== $code ) {
		return array( 'status' => $code );
	}
	$data = json_decode( wp_remote_retrieve_body( $response ), true );
	if ( ! is_array( $data ) ) {
		return array( 'status' => 502 );
	}
	return array( 'status' => 200, 'data' => $data, 'etag' => $tag );
}

/**
 * Stores one rendering of a picture under media/, once, and answers the address the page loads
 * it from — or null where it could not be had.
 *
 * Named by its address without the signature and by the width asked for: the same picture hangs
 * on many trips' answers under a different signature each time, and is still one file here.
 */
function silex_ce_bundle_media( $base, $url, $width, $place, &$tally ) {
	$absolute = ( 0 === strpos( $url, 'http://' ) || 0 === strpos( $url, 'https://' ) ) ? $url : $base . '/' . ltrim( $url, '/' );
	$sized    = preg_replace( '/([?&]size=)\d+/', '${1}' . (int) $width, $absolute );
	$unsigned = preg_split( '/[?&]token=/', $sized );
	$identity = substr( hash( 'sha256', $unsigned[0] . '|' . $width ), 0, 20 );
	foreach ( array( '.jpg', '.png', '.webp' ) as $ext ) {
		if ( file_exists( $place['dir'] . '/media/' . $identity . $ext ) ) {
			return $place['url'] . '/media/' . $identity . $ext;
		}
	}
	$response = wp_remote_get( $sized, array( 'timeout' => SILEX_CE_BUNDLE_TIMEOUT, 'redirection' => 0 ) );
	if ( is_wp_error( $response ) || 200 !== (int) wp_remote_retrieve_response_code( $response ) ) {
		$tally['mediaRefused'] ++;
		return null;
	}
	$type = (string) wp_remote_retrieve_header( $response, 'content-type' );
	$ext  = false !== strpos( $type, 'png' ) ? '.png' : ( false !== strpos( $type, 'webp' ) ? '.webp' : '.jpg' );
	$body = wp_remote_retrieve_body( $response );
	// Quietly, and judged by what it returns: a warning printed here would go out ahead of the
	// settings screen's redirect and leave the administrator on a blank page.
	if ( '' === $body || false === @file_put_contents( $place['dir'] . '/media/' . $identity . $ext . '.part', $body ) // phpcs:ignore WordPress.PHP.NoSilencedErrors
		|| ! @rename( $place['dir'] . '/media/' . $identity . $ext . '.part', $place['dir'] . '/media/' . $identity . $ext ) ) { // phpcs:ignore WordPress.PHP.NoSilencedErrors
		$tally['mediaRefused'] ++;
		return null;
	}
	$tally['mediaFetched'] ++;
	return $place['url'] . '/media/' . $identity . $ext;
}

/** A track as the page reads it from the file: its pictures stored here, no signed address left. */
function silex_ce_bundle_track( $base, $track, $place, &$tally ) {
	$picture = function ( $entry ) use ( $base, $place, &$tally ) {
		if ( empty( $entry['thumbnailUrl'] ) ) {
			return null;
		}
		$small = silex_ce_bundle_media( $base, $entry['thumbnailUrl'], SILEX_CE_BUNDLE_SMALL, $place, $tally );
		if ( ! $small ) {
			return null;
		}
		$large                 = silex_ce_bundle_media( $base, $entry['thumbnailUrl'], SILEX_CE_BUNDLE_LARGE, $place, $tally );
		$entry['thumbnailUrl'] = $small;
		$entry['url']          = $large ? $large : $small;
		return $entry;
	};
	$sheet = function ( $entry ) use ( $base, $place, &$tally ) {
		$image = empty( $entry['imageUrl'] ) ? null : silex_ce_bundle_media( $base, $entry['imageUrl'], SILEX_CE_BUNDLE_SHEET, $place, $tally );
		if ( ! $image ) {
			return null;
		}
		$entry['imageUrl'] = $image;
		return $entry;
	};
	$keep = function ( $list, $make ) {
		$out = array();
		foreach ( is_array( $list ) ? $list : array() as $entry ) {
			$made = is_array( $entry ) ? $make( $entry ) : null;
			if ( $made ) {
				$out[] = $made;
			}
		}
		return $out;
	};
	if ( isset( $track['model'] ) && is_array( $track['model'] ) ) {
		$model    = $track['model'];
		$pictures = $keep( isset( $model['pictures'] ) ? $model['pictures'] : array(), $picture );
		$sheets   = $keep( isset( $model['rasterMaps'] ) ? $model['rasterMaps'] : array(), $sheet );
		unset( $model['pictures'], $model['rasterMaps'] );
		$model               = silex_trips_unsigned( $model );
		$model['pictures']   = $pictures;
		$model['rasterMaps'] = $sheets;
		$track['model']      = $model;
	}
	$track['pictures'] = $keep( isset( $track['pictures'] ) ? $track['pictures'] : array(), $picture );
	return $track;
}

/**
 * Writes one cave's file from the installation, or leaves it as it is.
 *
 * Answers what it did, as counts. The file is only ever replaced whole — written beside itself
 * and renamed over — so a page never reads half of one.
 */
function silex_ce_bundle_refresh( $group ) {
	$began = microtime( true );
	$now   = gmdate( 'Y-m-d\TH:i:s\Z' );
	$all   = silex_ce_bundle_states();
	$state = isset( $all[ $group ] ) && is_array( $all[ $group ] ) ? $all[ $group ] : array();
	$state['checkedAt'] = $now;
	$tally = array( 'trips' => 0, 'tracksRead' => 0, 'tracksUnchanged' => 0, 'tracksKept' => 0,
		'tracksDropped' => 0, 'mediaFetched' => 0, 'mediaRefused' => 0, 'surveyFetched' => 0, 'surveyRefused' => 0 );

	// One writing at a time per cave: a second one started while the first runs would read the
	// installation twice for nothing and could rename an older copy over a newer one.
	$lock = 'silex_ce_bundle_lock_' . $group;
	if ( get_transient( $lock ) ) {
		return array( 'skipped' => 'busy' );
	}
	set_transient( $lock, $now, SILEX_CE_BUNDLE_BUDGET + 60 );

	$cfg   = silex_trips_config();
	$base  = $cfg['base'];
	$links = silex_trips_links( $group );
	$place = silex_ce_bundle_place( $group );

	$listing = null;
	$token   = null;
	foreach ( $links as $candidate ) {
		$read = silex_ce_bundle_read( $base, '/api/v1/public/trips/' . rawurlencode( $candidate ) . '/past' );
		if ( 200 === $read['status'] ) {
			$listing = $read['data'];
			$token   = $candidate;
			break;
		}
		$failure = $read['status'];
	}
	if ( null === $listing ) {
		$state['failedAt'] = $now;
		$state['failure']  = isset( $failure ) ? ( 0 === $failure ? 'unreachable' : 'HTTP ' . $failure ) : 'no link';
		silex_ce_bundle_save_state( $group, $state );
		delete_transient( $lock );
		return array( 'written' => false, 'failure' => $state['failure'] );
	}

	if ( ! wp_mkdir_p( $place['dir'] . '/media' ) ) {
		$state['failedAt'] = $now;
		$state['failure']  = 'no directory';
		silex_ce_bundle_save_state( $group, $state );
		delete_transient( $lock );
		return array( 'written' => false, 'failure' => $state['failure'] );
	}

	// The last copy: what a track that cannot be read this time, or is unchanged, is taken from.
	$before = null;
	if ( file_exists( $place['dir'] . '/trips.json' ) ) {
		$before = json_decode( (string) file_get_contents( $place['dir'] . '/trips.json' ), true );
	}
	$kept_tracks = ( is_array( $before ) && isset( $before['tracks'] ) && is_array( $before['tracks'] ) ) ? $before['tracks'] : array();
	$etags       = isset( $state['etags'] ) && is_array( $state['etags'] ) ? $state['etags'] : array();

	$rows   = isset( $listing['trips'] ) && is_array( $listing['trips'] ) ? $listing['trips'] : array();
	$tracks = array();
	$tags   = array();
	foreach ( $rows as $row ) {
		$id = isset( $row['tripLogId'] ) ? (string) $row['tripLogId'] : '';
		if ( ! preg_match( '/^[0-9a-fA-F-]{36}$/', $id ) || ( isset( $row['playable'] ) && ! $row['playable'] ) ) {
			continue;
		}
		$tally['trips'] ++;
		$had = isset( $kept_tracks[ $id ] ) ? $kept_tracks[ $id ] : null;
		if ( microtime( true ) - $began > SILEX_CE_BUNDLE_BUDGET ) {
			// Out of time: the rest keep their last copy and are read again next time.
			if ( $had ) {
				$tracks[ $id ] = $had;
				$tags[ $id ]   = isset( $etags[ $id ] ) ? $etags[ $id ] : null;
				$tally['tracksKept'] ++;
			}
			continue;
		}
		$read = silex_ce_bundle_read( $base, '/api/v1/public/trips/' . rawurlencode( $token ) . '/past/' . $id,
			$had && isset( $etags[ $id ] ) ? $etags[ $id ] : null );
		if ( 304 === $read['status'] && $had ) {
			$tracks[ $id ] = $had;
			$tags[ $id ]   = $read['etag'];
			$tally['tracksUnchanged'] ++;
		} elseif ( 200 === $read['status'] ) {
			$tracks[ $id ] = silex_ce_bundle_track( $base, $read['data'], $place, $tally );
			$tags[ $id ]   = $read['etag'] ? $read['etag'] : null;
			$tally['tracksRead'] ++;
		} elseif ( $had ) {
			$tracks[ $id ] = $had;
			$tags[ $id ]   = isset( $etags[ $id ] ) ? $etags[ $id ] : null;
			$tally['tracksKept'] ++;
		} else {
			$tally['tracksDropped'] ++;
		}
		usleep( 100000 ); // a courtesy to the installation's limiter
	}

	$doc  = array(
		'format'      => SILEX_CE_BUNDLE_FORMAT,
		'generatedAt' => $now,
		'past'        => array( 'trips' => array_values( $rows ), 'more' => ! empty( $listing['more'] ) ),
		'tracks'      => (object) $tracks,
	);
	$text = wp_json_encode( $doc, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES );
	// The link itself must never be in what is read out: the file is served to anybody.
	if ( ! is_string( $text ) || false !== strpos( $text, $token ) ) {
		$state['failedAt'] = $now;
		$state['failure']  = 'refused to write';
		silex_ce_bundle_save_state( $group, $state );
		delete_transient( $lock );
		return array( 'written' => false, 'failure' => $state['failure'] );
	}
	$part = $place['dir'] . '/trips.json.part';
	if ( false === @file_put_contents( $part, $text ) || ! @rename( $part, $place['dir'] . '/trips.json' ) ) { // phpcs:ignore WordPress.PHP.NoSilencedErrors
		$state['failedAt'] = $now;
		$state['failure']  = 'not written';
		silex_ce_bundle_save_state( $group, $state );
		delete_transient( $lock );
		return array( 'written' => false, 'failure' => $state['failure'] );
	}

	// The copy is a data set once the cave is written beside the trips: the survey file, the named
	// places and the photographs, from the newest finished trip's survey block (cave-data.php).
	silex_ce_cave_write( $group, $base, $token, $rows, $tracks, $place, $state, $tally );

	$state['writtenAt'] = $now;
	$state['failure']   = null;
	$state['etags']     = $tags;
	$state['tally']     = $tally;
	$state['bytes']     = strlen( $text );
	silex_ce_bundle_save_state( $group, $state );
	delete_transient( $lock );
	return array( 'written' => true ) + $tally;
}

/**
 * Writes every cave's file: what the scheduled event and the settings screen's button run. Nothing,
 * while the site is set to keep no copy; what is on disk then stays as it was.
 */
function silex_ce_bundle_refresh_all() {
	if ( ! silex_ce_keep_copy() ) {
		return array();
	}
	if ( function_exists( 'set_time_limit' ) ) {
		@set_time_limit( SILEX_CE_BUNDLE_BUDGET + 60 ); // phpcs:ignore WordPress.PHP.NoSilencedErrors
	}
	$done = array();
	foreach ( silex_ce_bundle_groups() as $group ) {
		$done[ $group ] = silex_ce_bundle_refresh( $group );
	}
	return $done;
}

add_filter( 'cron_schedules', function ( $schedules ) {
	$schedules['silex_ce_every_five_minutes'] = array(
		'interval' => SILEX_CE_BUNDLE_EVERY,
		'display'  => __( 'Every five minutes (the copy of the trips)', 'silexgis-caveview-3d' ),
	);
	return $schedules;
} );

add_action( SILEX_CE_BUNDLE_HOOK, 'silex_ce_bundle_refresh_all' );

// Scheduled while the plugin runs, keeps a copy and has a cave to keep it of; taken off otherwise,
// and by the plugin's deactivation (see the main file).
add_action( 'init', function () {
	$scheduled = wp_next_scheduled( SILEX_CE_BUNDLE_HOOK );
	if ( silex_ce_bundle_groups() && silex_ce_keep_copy() ) {
		if ( ! $scheduled ) {
			wp_schedule_event( time() + 60, 'silex_ce_every_five_minutes', SILEX_CE_BUNDLE_HOOK );
		}
	} elseif ( $scheduled ) {
		wp_clear_scheduled_hook( SILEX_CE_BUNDLE_HOOK );
	}
} );

// The settings screen's "write it now", and the switch for the notice.
add_action( 'admin_post_silex_ce_bundle_refresh', function () {
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_die( esc_html__( 'You are not allowed to do this.', 'silexgis-caveview-3d' ), 403 );
	}
	check_admin_referer( 'silex_ce_bundle_refresh' );
	$done    = silex_ce_bundle_refresh_all();
	$written = 0;
	foreach ( $done as $one ) {
		$written += empty( $one['written'] ) ? 0 : 1;
	}
	wp_safe_redirect( add_query_arg( array( 'page' => 'silexgis-caveview-3d', 'silex_ce_bundle' => $written . '-' . count( $done ) ),
		admin_url( 'options-general.php' ) ) );
	exit;
} );
