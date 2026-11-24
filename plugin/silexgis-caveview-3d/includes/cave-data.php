<?php
/**
 * The cave itself — its survey file, its named places, the photographs at its stations — for a
 * page that draws it from a data set rather than from its own configuration.
 *
 * A DATA SET
 *
 * A directory holding `cave.json` (the survey file, the places, the photographs), `trips.json`
 * (the trips and their tracks, as the published routes answer them) and the files both name,
 * under `media/`. The component reads one from its address, on any page; this file is how the
 * site comes to hold one and tells its pages where. There are three ways:
 *
 * - THE SITE'S COPY OF AN INSTALLATION. The copy the scheduled writing keeps of a cave's trips
 *   (trips-bundle.php) is a data set once its `cave.json` is written beside `trips.json`: written
 *   here, from the newest finished trip's survey block — the installation's named places, its
 *   published photographs, and the survey file itself, fetched only when its digest says it
 *   changed. A page then draws the whole cave from this site, and goes on doing so for as long
 *   as the installation is away.
 * - THE INSTALLATION, AS IT IS ASKED, with no copy kept (the "keep a copy" setting off): the same
 *   `cave.json` built on each read from the installation's answer, and the files it names fetched
 *   through this site as a browser asks for them — the signed addresses never leave this server.
 * - AN IMPORTED ARCHIVE: a zip of a data set's directory, uploaded on the settings screen, with no
 *   installation behind it at all. A SilexGIS installation will be able to write such an archive
 *   for a cave and its published trips; until then one is written by hand or taken from a copy.
 */

defined( 'ABSPATH' ) || exit;

/** Whether the site keeps its own copy of what an installation publishes. On unless switched off. */
const SILEX_CE_OPTION_KEEP_COPY = 'silex_ce_keep_copy';
/** The form of `cave.json`. */
const SILEX_CE_CAVE_FORMAT = 'silexgis-cave/1';
/** How long fetching a survey file may take: one of several megabytes, from a server nobody waits on. */
const SILEX_CE_SURVEY_TIMEOUT = 120;
/** The largest archive the settings screen takes, and the most it may unpack to. */
const SILEX_CE_DATASET_MAX_BYTES = 209715200;
/** The kinds of file a data set may hold. No script, no markup: everything here is served as it is. */
const SILEX_CE_DATASET_TYPES = array( 'json', 'lox', '3d', 'plt', 'jpg', 'jpeg', 'png', 'webp' );
/** How long one read of a track is kept for the files fetched through this site. */
const SILEX_CE_LIVE_TTL = 60;

function silex_ce_keep_copy() {
	return '0' !== (string) get_option( SILEX_CE_OPTION_KEEP_COPY, '1' );
}

/** What a data set's name may be: the alphabet and length a page's `data.group` is written in. */
function silex_ce_dataset_name_ok( $name ) {
	return is_string( $name ) && 1 === preg_match( '/^[a-z0-9][a-z0-9_-]{0,39}$/', $name );
}

/** Where an imported data set lives on disk, and the address it is served at. */
function silex_ce_dataset_place( $name ) {
	$uploads = wp_upload_dir( null, false );
	$tail    = '/' . SILEX_CE_UPLOADS_DIR . '/datasets/' . $name;
	return array(
		'dir' => $uploads['basedir'] . $tail,
		'url' => set_url_scheme( $uploads['baseurl'] . $tail, 'relative' ),
	);
}

/** The imported data sets, by name. */
function silex_ce_datasets() {
	$uploads = wp_upload_dir( null, false );
	$root    = $uploads['basedir'] . '/' . SILEX_CE_UPLOADS_DIR . '/datasets';
	$out     = array();
	foreach ( is_dir( $root ) ? (array) scandir( $root ) : array() as $name ) {
		if ( silex_ce_dataset_name_ok( $name ) && file_exists( $root . '/' . $name . '/cave.json' ) ) {
			$out[] = $name;
		}
	}
	return $out;
}

/**
 * What a page is told about the data sets it may name: for each, the address of its directory,
 * when it was written, and whether it holds a trips file. An imported set comes over the copy of
 * an installation of the same name: importing it is the later and the more deliberate act.
 */
function silex_ce_datasets_for_pages() {
	$out    = array();
	$states = silex_ce_bundle_states();
	foreach ( silex_ce_bundle_groups() as $group ) {
		$place = silex_ce_bundle_place( $group );
		if ( silex_ce_keep_copy() ) {
			if ( file_exists( $place['dir'] . '/cave.json' ) ) {
				$out[ $group ] = array(
					'base'      => $place['url'] . '/',
					'writtenAt' => isset( $states[ $group ]['caveWrittenAt'] ) ? $states[ $group ]['caveWrittenAt'] : null,
				);
			}
		} else {
			$out[ $group ] = array(
				'base'  => wp_make_link_relative( rest_url( SILEX_CE_REST_NAMESPACE . '/cave/' . $group . '/' ) ),
				'trips' => false,
			);
		}
	}
	foreach ( silex_ce_datasets() as $name ) {
		$place        = silex_ce_dataset_place( $name );
		$out[ $name ] = array(
			'base'      => $place['url'] . '/',
			'writtenAt' => gmdate( 'Y-m-d\TH:i:s\Z', (int) filemtime( $place['dir'] . '/cave.json' ) ),
		);
	}
	return $out;
}

/**
 * The cave part of a data set, from one survey block of the installation's answer.
 *
 * `$picture` turns one published photograph into `[file, thumbnail]` addresses the page can load,
 * or null; `$survey` is the address of the survey file as the page reads it, or null.
 */
function silex_ce_cave_doc( $model, $survey, $picture ) {
	$places = array();
	foreach ( isset( $model['places'] ) && is_array( $model['places'] ) ? $model['places'] : array() as $p ) {
		if ( ! is_array( $p ) || empty( $p['station'] ) || ! isset( $p['label'] ) || '' === (string) $p['label'] ) {
			continue;
		}
		$place = array( 'station' => (string) $p['station'], 'label' => (string) $p['label'] );
		if ( isset( $p['depthM'] ) && is_numeric( $p['depthM'] ) ) {
			$place['depth'] = abs( (float) $p['depthM'] );
		}
		if ( ! empty( $p['note'] ) ) {
			$place['note'] = (string) $p['note'];
		}
		if ( ! empty( $p['landmark'] ) ) {
			$place['landmark'] = true;
		}
		$places[] = $place;
	}
	$pictures = array();
	foreach ( isset( $model['pictures'] ) && is_array( $model['pictures'] ) ? $model['pictures'] : array() as $p ) {
		if ( ! is_array( $p ) || empty( $p['stationName'] ) ) {
			continue;
		}
		$addresses = $picture( $p );
		if ( ! $addresses ) {
			continue;
		}
		$pictures[] = array(
			'station'   => (string) $p['stationName'],
			'file'      => $addresses[0],
			'thumbnail' => $addresses[1],
			'caption'   => isset( $p['caption'] ) ? (string) $p['caption'] : '',
		);
	}
	$doc = array(
		'format'    => SILEX_CE_CAVE_FORMAT,
		'writtenAt' => gmdate( 'Y-m-d\TH:i:s\Z' ),
		'source'    => 'silexgis',
	);
	if ( $survey ) {
		$doc['survey'] = array(
			'file'   => $survey,
			'format' => silex_ce_survey_extension( isset( $model['format'] ) ? $model['format'] : '' ),
			'sha256' => isset( $model['modelSha256'] ) ? strtolower( (string) $model['modelSha256'] ) : null,
		);
	}
	$doc['places']   = $places;
	$doc['pictures'] = $pictures;
	return $doc;
}

/**
 * The file extension a survey of this format is read under, or null for one the viewer cannot read.
 * The installation names its formats as words (`lox`, `survex3d`, `stl`); a set written by hand may
 * name the extension itself.
 */
function silex_ce_survey_extension( $format ) {
	$known  = array( 'lox' => 'lox', 'survex3d' => '3d', '3d' => '3d', 'plt' => 'plt' );
	$format = strtolower( (string) $format );
	return isset( $known[ $format ] ) ? $known[ $format ] : null;
}

/** The newest finished trip of a list that the installation lets be played back, or null. */
function silex_ce_newest_trip( $rows ) {
	$best = null;
	foreach ( is_array( $rows ) ? $rows : array() as $row ) {
		if ( ! is_array( $row ) || empty( $row['tripLogId'] ) || ( isset( $row['playable'] ) && ! $row['playable'] ) ) {
			continue;
		}
		$key = (string) ( isset( $row['closedAt'] ) ? $row['closedAt'] : '' ) . '|' . (string) ( isset( $row['tripDate'] ) ? $row['tripDate'] : '' );
		if ( null === $best || strcmp( $key, $best[0] ) > 0 ) {
			$best = array( $key, (string) $row['tripLogId'] );
		}
	}
	return $best ? $best[1] : null;
}

/**
 * Writes a cave's `cave.json` beside its copy of the trips, and its survey file where that changed.
 *
 * `$tracks` are the tracks just written (their pictures already stored here); the survey block is
 * taken from the newest of them. The survey file is fetched only when the installation's digest of
 * it differs from the one stored — through a fresh read of that trip, since a kept track holds no
 * signed address — and is stored under a name made from its digest, so that a browser keeps it as
 * long as it does not change and fetches it again the moment it does.
 */
function silex_ce_cave_write( $group, $base, $token, $rows, $tracks, $place, &$state, &$tally ) {
	$newest = silex_ce_newest_trip( $rows );
	if ( null === $newest || empty( $tracks[ $newest ]['model'] ) || ! is_array( $tracks[ $newest ]['model'] ) ) {
		return false;
	}
	$model  = $tracks[ $newest ]['model'];
	$ext    = silex_ce_survey_extension( isset( $model['format'] ) ? $model['format'] : '' );
	$digest = isset( $model['modelSha256'] ) && preg_match( '/^[0-9a-f]{64}$/i', (string) $model['modelSha256'] ) ? strtolower( $model['modelSha256'] ) : null;
	$survey = isset( $state['survey'] ) && is_string( $state['survey'] ) && file_exists( $place['dir'] . '/' . $state['survey'] ) ? $state['survey'] : null;
	$wanted = $ext && ( null === $survey || ( $digest && ( ! isset( $state['surveySha256'] ) || $state['surveySha256'] !== $digest ) ) );

	if ( $wanted ) {
		$read = silex_ce_bundle_read( $base, '/api/v1/public/trips/' . rawurlencode( $token ) . '/past/' . $newest );
		$url  = 200 === $read['status'] && isset( $read['data']['model']['modelUrl'] ) ? (string) $read['data']['model']['modelUrl'] : '';
		if ( '' !== $url ) {
			$absolute = ( 0 === strpos( $url, 'http://' ) || 0 === strpos( $url, 'https://' ) ) ? $url : $base . '/' . ltrim( $url, '/' );
			$part     = $place['dir'] . '/media/survey.part';
			$response = wp_remote_get( $absolute, array(
				'timeout'     => SILEX_CE_SURVEY_TIMEOUT,
				'redirection' => 0,
				'stream'      => true,
				'filename'    => $part,
			) );
			$ok   = ! is_wp_error( $response ) && 200 === (int) wp_remote_retrieve_response_code( $response ) && file_exists( $part ) && filesize( $part ) > 0;
			$sha  = $ok ? hash_file( 'sha256', $part ) : null;
			if ( $ok && ( null === $digest || $sha === $digest ) ) {
				$name = 'media/survey-' . substr( $sha, 0, 16 ) . '.' . $ext;
				if ( @rename( $part, $place['dir'] . '/' . $name ) ) { // phpcs:ignore WordPress.PHP.NoSilencedErrors
					// The survey it replaces goes: only one survey file is ever named.
					if ( $survey && $survey !== $name ) {
						@unlink( $place['dir'] . '/' . $survey ); // phpcs:ignore WordPress.PHP.NoSilencedErrors
					}
					$survey                = $name;
					$state['survey']       = $name;
					$state['surveySha256'] = $sha;
					$tally['surveyFetched'] = 1;
				}
			} else {
				$tally['surveyRefused'] = 1;
			}
			if ( file_exists( $part ) ) {
				@unlink( $part ); // phpcs:ignore WordPress.PHP.NoSilencedErrors
			}
		} else {
			$tally['surveyRefused'] = 1;
		}
	}

	$prefix = $place['url'] . '/';
	$doc    = silex_ce_cave_doc( $model, $survey, function ( $p ) use ( $prefix ) {
		// The copy has already stored this photograph and points at it; the set names it
		// relative to itself, so that the directory can be moved or archived as it is.
		$small = isset( $p['thumbnailUrl'] ) ? (string) $p['thumbnailUrl'] : '';
		$large = isset( $p['url'] ) ? (string) $p['url'] : $small;
		if ( 0 !== strpos( $small, $prefix ) ) {
			return null;
		}
		return array( substr( 0 === strpos( $large, $prefix ) ? $large : $small, strlen( $prefix ) ), substr( $small, strlen( $prefix ) ) );
	} );
	if ( isset( $doc['survey'] ) ) {
		// The digest of the file this site holds — not the installation's new one when fetching the
		// new file failed and the old one is still what the set names.
		$doc['survey']['sha256'] = isset( $state['surveySha256'] ) ? (string) $state['surveySha256'] : null;
	}
	// Written only when it says something new: a browser asks for cave.json on every visit and is
	// answered "not modified" for as long as the file stays as it is.
	$before = file_exists( $place['dir'] . '/cave.json' ) ? json_decode( (string) file_get_contents( $place['dir'] . '/cave.json' ), true ) : null;
	if ( is_array( $before ) && isset( $before['writtenAt'] ) ) {
		$same              = $doc;
		$same['writtenAt'] = $before['writtenAt'];
		if ( $same === $before ) {
			$state['caveWrittenAt'] = $before['writtenAt'];
			return true;
		}
	}
	$text = wp_json_encode( $doc, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES );
	if ( ! is_string( $text ) || false !== strpos( $text, $token ) || false !== strpos( $text, 'token=' ) ) {
		return false;
	}
	$part = $place['dir'] . '/cave.json.part';
	if ( false === @file_put_contents( $part, $text ) || ! @rename( $part, $place['dir'] . '/cave.json' ) ) { // phpcs:ignore WordPress.PHP.NoSilencedErrors
		return false;
	}
	$state['caveWrittenAt'] = $doc['writtenAt'];
	return true;
}

/* ---- the installation as it is asked, with no copy kept ------------------------------------ */

/**
 * The newest finished trip's track as the installation answers it, signed addresses and all —
 * kept a minute on this server, which is the only place a signed address is ever held.
 */
function silex_ce_live_track( $group ) {
	$key  = 'silex_ce_live_' . md5( $group );
	$kept = get_transient( $key );
	if ( is_array( $kept ) ) {
		return $kept;
	}
	// A read that found nothing is remembered as briefly as the proxy remembers one, so that a crowd
	// of readers, or one caller in a loop, asks the installation once and not once each.
	if ( 'none' === $kept ) {
		return null;
	}
	$found = silex_ce_live_track_read( $group );
	set_transient( $key, null === $found ? 'none' : $found, null === $found ? SILEX_TRIPS_TTL_MEMO : SILEX_CE_LIVE_TTL );
	return $found;
}

/** One read of the newest finished trip's track, through the group's links in turn; null for none. */
function silex_ce_live_track_read( $group ) {
	$cfg = silex_trips_config();
	foreach ( silex_trips_links( $group ) as $token ) {
		$list = silex_ce_bundle_read( $cfg['base'], '/api/v1/public/trips/' . rawurlencode( $token ) . '/past' );
		if ( 200 !== $list['status'] ) {
			continue;
		}
		$newest = silex_ce_newest_trip( isset( $list['data']['trips'] ) ? $list['data']['trips'] : array() );
		if ( null === $newest ) {
			return null;
		}
		$read = silex_ce_bundle_read( $cfg['base'], '/api/v1/public/trips/' . rawurlencode( $token ) . '/past/' . $newest );
		if ( 200 !== $read['status'] ) {
			return null;
		}
		return array( 'base' => $cfg['base'], 'trip' => $newest, 'track' => $read['data'] );
	}
	return null;
}

/** The name a signed address is fetched under through this site: its address without the signature. */
function silex_ce_live_key( $url ) {
	$unsigned = preg_split( '/[?&]token=/', (string) $url );
	return substr( hash( 'sha256', $unsigned[0] ), 0, 20 );
}

add_action( 'rest_api_init', function () {
	$group = '(?P<group>[a-z0-9][a-z0-9_-]{0,39})';
	register_rest_route( SILEX_CE_REST_NAMESPACE, '/cave/' . $group . '/cave\.json', array(
		'methods'             => 'GET',
		'permission_callback' => '__return_true',
		'callback'            => function ( $request ) {
			$live = silex_ce_keep_copy() ? null : silex_ce_live_track( (string) $request['group'] );
			if ( ! $live || empty( $live['track']['model'] ) ) {
				return new WP_Error( 'silex_ce_no_cave', 'No cave.', array( 'status' => 404 ) );
			}
			$model  = $live['track']['model'];
			$ext    = silex_ce_survey_extension( isset( $model['format'] ) ? $model['format'] : '' );
			$survey = $ext && ! empty( $model['modelUrl'] ) ? 'file/' . silex_ce_live_key( $model['modelUrl'] ) . '.' . $ext : null;
			$doc    = silex_ce_cave_doc( $model, $survey, function ( $p ) {
				if ( empty( $p['thumbnailUrl'] ) ) {
					return null;
				}
				$small = preg_replace( '/([?&]size=)\d+/', '${1}' . SILEX_CE_BUNDLE_SMALL, (string) $p['thumbnailUrl'] );
				$large = preg_replace( '/([?&]size=)\d+/', '${1}' . SILEX_CE_BUNDLE_LARGE, (string) $p['thumbnailUrl'] );
				return array( 'file/' . silex_ce_live_key( $large ) . '.jpg', 'file/' . silex_ce_live_key( $small ) . '.jpg' );
			} );
			$response = new WP_REST_Response( $doc, 200 );
			$response->header( 'Cache-Control', 'public, max-age=' . SILEX_CE_LIVE_TTL );
			return $response;
		},
	) );
	register_rest_route( SILEX_CE_REST_NAMESPACE, '/cave/' . $group . '/file/(?P<key>[0-9a-f]{20})\.(?P<ext>lox|3d|plt|jpg)', array(
		'methods'             => 'GET',
		'permission_callback' => '__return_true',
		'callback'            => function ( $request ) {
			$live = silex_ce_keep_copy() ? null : silex_ce_live_track( (string) $request['group'] );
			$want = (string) $request['key'];
			$url  = null;
			if ( $live && ! empty( $live['track']['model'] ) ) {
				$model      = $live['track']['model'];
				$candidates = empty( $model['modelUrl'] ) ? array() : array( (string) $model['modelUrl'] );
				foreach ( isset( $model['pictures'] ) && is_array( $model['pictures'] ) ? $model['pictures'] : array() as $p ) {
					if ( ! empty( $p['thumbnailUrl'] ) ) {
						foreach ( array( SILEX_CE_BUNDLE_SMALL, SILEX_CE_BUNDLE_LARGE ) as $w ) {
							$candidates[] = preg_replace( '/([?&]size=)\d+/', '${1}' . $w, (string) $p['thumbnailUrl'] );
						}
					}
				}
				foreach ( $candidates as $candidate ) {
					if ( silex_ce_live_key( $candidate ) === $want ) {
						$url = $candidate;
						break;
					}
				}
			}
			if ( null === $url ) {
				return new WP_Error( 'silex_ce_no_file', 'No such file.', array( 'status' => 404 ) );
			}
			$absolute = ( 0 === strpos( $url, 'http://' ) || 0 === strpos( $url, 'https://' ) ) ? $url : $live['base'] . '/' . ltrim( $url, '/' );
			return new WP_REST_Response( array( 'silexCeStream' => $absolute, 'ext' => (string) $request['ext'] ), 200 );
		},
	) );
} );

/**
 * A file asked for through the cave's route goes out as its own bytes, not as JSON: fetched from
 * the installation into a temporary file and passed on, with a lifetime a browser keeps it for —
 * long, since the name it is asked under is made from the file it is.
 */
add_filter( 'rest_pre_serve_request', function ( $served, $result, $request ) {
	if ( $served || ! ( $result instanceof WP_REST_Response ) ) {
		return $served;
	}
	$data = $result->get_data();
	if ( ! is_array( $data ) || empty( $data['silexCeStream'] ) || 0 !== strpos( $request->get_route(), '/' . SILEX_CE_REST_NAMESPACE . '/cave/' ) ) {
		return $served;
	}
	// wp_tempnam() is in the admin's includes, which a REST request does not load.
	$temp     = tempnam( get_temp_dir(), 'silex-ce' );
	$response = wp_remote_get( $data['silexCeStream'], array(
		'timeout'     => SILEX_CE_SURVEY_TIMEOUT,
		'redirection' => 0,
		'stream'      => true,
		'filename'    => $temp,
	) );
	if ( is_wp_error( $response ) || 200 !== (int) wp_remote_retrieve_response_code( $response ) ) {
		@unlink( $temp ); // phpcs:ignore WordPress.PHP.NoSilencedErrors
		status_header( 502 );
		return true;
	}
	$types = array( 'jpg' => 'image/jpeg', 'lox' => 'application/octet-stream', '3d' => 'application/octet-stream', 'plt' => 'text/plain' );
	$type  = (string) wp_remote_retrieve_header( $response, 'content-type' );
	status_header( 200 );
	header( 'Content-Type: ' . ( 'jpg' === $data['ext'] && '' !== $type ? $type : $types[ $data['ext'] ] ) );
	header( 'Content-Length: ' . filesize( $temp ) );
	header( 'Cache-Control: public, max-age=31536000, immutable' );
	header( 'X-Content-Type-Options: nosniff' );
	readfile( $temp );
	@unlink( $temp ); // phpcs:ignore WordPress.PHP.NoSilencedErrors
	return true;
}, 10, 3 );

/* ---- imported archives ---------------------------------------------------------------------- */

/**
 * Unpacks an archive of a data set into the set of that name, replacing it whole, or refuses it.
 *
 * Answers `array( 'ok' => bool, 'reason' => string|null, 'files' => int )`. Every entry is judged
 * before anything is written: a path that climbs out of the set or is absolute, a kind of file a
 * set does not hold, an archive that unpacks to more than the limit, or one with no `cave.json` of
 * the set's form at its root, is the whole archive refused. Unpacked beside the set and renamed
 * over it, so that a page never reads half of one.
 */
function silex_ce_dataset_import( $zip_path, $name ) {
	if ( ! silex_ce_dataset_name_ok( $name ) ) {
		return array( 'ok' => false, 'reason' => 'name', 'files' => 0 );
	}
	if ( ! class_exists( 'ZipArchive' ) ) {
		return array( 'ok' => false, 'reason' => 'nozip', 'files' => 0 );
	}
	$zip = new ZipArchive();
	if ( true !== $zip->open( $zip_path ) ) {
		return array( 'ok' => false, 'reason' => 'unreadable', 'files' => 0 );
	}
	$total   = 0;
	$entries = array();
	for ( $i = 0; $i < $zip->numFiles; $i++ ) {
		$stat = $zip->statIndex( $i );
		$path = str_replace( '\\', '/', (string) $stat['name'] );
		if ( '/' === substr( $path, -1 ) ) {
			continue;
		}
		$parts = explode( '/', $path );
		$ext   = strtolower( pathinfo( $path, PATHINFO_EXTENSION ) );
		if ( '' === $path || '/' === $path[0] || preg_match( '/^[A-Za-z]:/', $path ) || in_array( '..', $parts, true )
			|| in_array( '', $parts, true ) || ! in_array( $ext, SILEX_CE_DATASET_TYPES, true ) || count( $parts ) > 3 ) {
			$zip->close();
			return array( 'ok' => false, 'reason' => 'entry', 'files' => 0 );
		}
		$total += (int) $stat['size'];
		$entries[ $i ] = $path;
	}
	if ( $total > SILEX_CE_DATASET_MAX_BYTES ) {
		$zip->close();
		return array( 'ok' => false, 'reason' => 'size', 'files' => 0 );
	}
	$cave = $zip->getFromName( 'cave.json' );
	$doc  = is_string( $cave ) ? json_decode( $cave, true ) : null;
	if ( ! is_array( $doc ) || ( isset( $doc['format'] ) && 0 !== strpos( (string) $doc['format'], 'silexgis-cave/1' ) ) ) {
		$zip->close();
		return array( 'ok' => false, 'reason' => 'cave', 'files' => 0 );
	}
	$place = silex_ce_dataset_place( $name );
	$fresh = $place['dir'] . '.part';
	silex_ce_dataset_remove_dir( $fresh );
	if ( ! wp_mkdir_p( $fresh ) ) {
		$zip->close();
		return array( 'ok' => false, 'reason' => 'write', 'files' => 0 );
	}
	foreach ( $entries as $i => $path ) {
		$target = $fresh . '/' . $path;
		if ( ! wp_mkdir_p( dirname( $target ) ) || false === @file_put_contents( $target, $zip->getFromIndex( $i ) ) ) { // phpcs:ignore WordPress.PHP.NoSilencedErrors
			$zip->close();
			silex_ce_dataset_remove_dir( $fresh );
			return array( 'ok' => false, 'reason' => 'write', 'files' => 0 );
		}
	}
	$zip->close();
	$old = $place['dir'] . '.old';
	silex_ce_dataset_remove_dir( $old );
	if ( is_dir( $place['dir'] ) && ! @rename( $place['dir'], $old ) ) { // phpcs:ignore WordPress.PHP.NoSilencedErrors
		silex_ce_dataset_remove_dir( $fresh );
		return array( 'ok' => false, 'reason' => 'write', 'files' => 0 );
	}
	if ( ! @rename( $fresh, $place['dir'] ) ) { // phpcs:ignore WordPress.PHP.NoSilencedErrors
		if ( is_dir( $old ) ) {
			@rename( $old, $place['dir'] ); // phpcs:ignore WordPress.PHP.NoSilencedErrors
		}
		silex_ce_dataset_remove_dir( $fresh );
		return array( 'ok' => false, 'reason' => 'write', 'files' => 0 );
	}
	silex_ce_dataset_remove_dir( $old );
	return array( 'ok' => true, 'reason' => null, 'files' => count( $entries ) );
}

/** Removes a directory this file made, and everything in it. */
function silex_ce_dataset_remove_dir( $dir ) {
	if ( ! is_dir( $dir ) ) {
		return;
	}
	$uploads = wp_upload_dir( null, false );
	if ( 0 !== strpos( wp_normalize_path( $dir ), wp_normalize_path( $uploads['basedir'] . '/' . SILEX_CE_UPLOADS_DIR . '/' ) ) ) {
		return;
	}
	foreach ( (array) scandir( $dir ) as $entry ) {
		if ( '.' === $entry || '..' === $entry ) {
			continue;
		}
		$path = $dir . '/' . $entry;
		if ( is_dir( $path ) && ! is_link( $path ) ) {
			silex_ce_dataset_remove_dir( $path );
		} else {
			@unlink( $path ); // phpcs:ignore WordPress.PHP.NoSilencedErrors
		}
	}
	@rmdir( $dir ); // phpcs:ignore WordPress.PHP.NoSilencedErrors
}

/** Takes an imported data set off the site. */
function silex_ce_dataset_delete( $name ) {
	if ( ! silex_ce_dataset_name_ok( $name ) ) {
		return false;
	}
	$place = silex_ce_dataset_place( $name );
	silex_ce_dataset_remove_dir( $place['dir'] );
	return ! is_dir( $place['dir'] );
}
