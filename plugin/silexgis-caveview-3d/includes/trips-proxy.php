<?php
/**
 * The cave's published trips, fetched for the page by this server rather than by the browser.
 *
 * WHY A PROXY AND NOT A DIRECT CALL
 *
 * A SilexGIS installation publishes a trip by minting a link, and that link is the whole of
 * the holder's claim to it — there is no password behind it. A browser calling the
 * installation directly would need the token in the page source, where anyone viewing source
 * (or any third-party script the site loads) can take it and keep it for as long as it lasts.
 * Fetching here keeps the token in the site's own options, and the page asks this server for
 * addresses that carry no credential at all.
 *
 * It also means the installation needs to grant this site no cross-origin permission, and it
 * puts a cache in front of routes that answer anonymously: a popular article would otherwise
 * be an uncached read of somebody else's database once per reader per twenty seconds.
 *
 * WHAT IT DOES NOT DO
 *
 * It does not reshape, filter or enrich what the installation says about a trip. The
 * installation has already decided what a trip may say about the people on it — which names
 * are published, whose position is withheld, which reports belong to the survey being drawn —
 * and a proxy that edited any of that would be a second opinion about a protection decision.
 *
 * One thing is taken out, and it is not about the trip. Beside a trip the installation hands
 * its caller signed addresses of its own files — the survey model's bytes among them — each
 * good for some minutes to whoever holds it. The page draws on the model the article already
 * carries and reads none of them, and the reason for this file is that a claim on the
 * installation stays on this server; a signed address relayed to every anonymous caller is
 * such a claim leaving it for nothing. See silex_trips_without_signed_addresses().
 *
 * WHO MAY ASK, AND WHAT ASKING MAY COST
 *
 * Anybody may ask: the routes are public because what they relay is public. So a slot's name
 * is not a secret, and a link saved on the settings screen is readable through this site from
 * that moment by whoever knows or guesses the name, whatever the page that will use it.
 *
 * What a caller must not be able to do is spend the installation's patience in this site's
 * name. The installation counts every read against the one address this server asks from,
 * a refusal included, and refuses that address for the rest of the minute once the count is
 * reached — which takes the party off every reader's page. So nothing a caller writes decides
 * how often the installation is asked: an answer is kept for a stated time whoever asks for
 * it, a refusal and a failure to reach the installation are remembered briefly, a link known
 * to be dead is not asked first, and a trip identifier is looked up in the archive this
 * server already holds before anything is asked about it.
 */

defined( 'ABSPATH' ) || exit;

const SILEX_TRIPS_OPTION = 'silex_cave_trips';
// A counter every cache key carries; forgetting is moving it on (see silex_trips_key).
const SILEX_TRIPS_GENERATION = 'silex_trips_generation';

// What a slot may be called: the alphabet and the length the routes below accept. The settings
// screen refuses any other name with this same pattern, because a link saved under a name no
// address can spell is a link the page silently cannot ask for.
const SILEX_TRIPS_SLOT = '[A-Za-z0-9_-]{1,40}';

/** How long an answer is kept, by what it answers. */
const SILEX_TRIPS_TTL_LIVE  = 20;    // a party underground moves; the page polls anyway
// Whether the installation has a list of the trips being followed. Remembered for an hour
// rather than re-discovered on every read: an installation gains that route by being
// updated, which is not something that happens between two page loads, and asking it every
// time costs a refused request per reader per interval for an answer that changes once.
// The link of a group that answered last, and a link that refused the list, are remembered
// for as long, for the same reason.
const SILEX_TRIPS_TTL_SHAPE = 3600;
const SILEX_TRIPS_TTL_PAST  = 300;   // the list changes when a trip closes
// A finished trip's track does change: a coordinator corrects a report in place on a closed
// trip, from notes, days later — and the installation re-decides on every read whether the
// link still opens it and whether the cave's positions may be shown at all. Whatever this
// cache holds keeps being served for this long after any of that changed, so it is short.
// The cost is small: a track is one JSON the page fetches once per selection, not per poll.
// "Empty the cache" on the settings screen is what makes a change immediate.
const SILEX_TRIPS_TTL_TRACK = 60;
// How long something that is not an answer is remembered: a link that refused its own trip,
// every link of a group refusing one question, a read that twice running got no answer, the
// installation not being reachable at all, and the archive having just been read again for
// an identifier it does not list. Long enough that a crowd of readers, or one caller in a
// loop, asks the installation once and not once each; short enough that a link which starts
// answering again, an installation that comes back and a trip that has just become history
// are all on the page within about this long.
const SILEX_TRIPS_TTL_MEMO  = 20;
// How long one read that got no answer stays on record, unless an answer takes it off sooner
// (see silex_trips_ask). Longer than the longest pause the page leaves between two tries of a
// read that keeps failing — two minutes — so that for as long as the installation is down,
// each try finds the one before it on record and is the only one waited for.
const SILEX_TRIPS_TTL_RECORD = 300;
// The longest a reader's browser may keep an answer, and it is never told longer than the
// kept copy here has left: the times above therefore stay the whole of how stale a page can
// be, and the settings screen can say so. It is under the page's ordinary pace — a read every
// thirty seconds while a party is underground — so each of those reaches this server and is
// answered from what this server knows now. The page also asks sooner than that: every ten
// seconds while it waits for a trip to turn up as history, and five seconds after a read
// that failed. Such a read may be answered by the browser's own copy instead of by this
// server. That copy says nothing this server would not have said itself until the copy here
// ran out; the one thing it cannot know is that this server has let its own copy go ahead of
// time — the archive when a trip left the followed list, everything on a flush — and that
// is the case in which a page shows an answer for up to twenty seconds longer than this
// server would give it.
const SILEX_TRIPS_BROWSER   = 20;
// How long one read of the installation may take, in seconds. A read is a small JSON and is
// answered in well under a second when the installation is well; one that has not answered
// in six is not going to be of use to the reader waiting for it. The number is also how long
// a PHP process is held when the installation's machine is down, and a shared host allows
// only so many of those at once: every second here is a second in which a reader's retry
// occupies one for nothing, on a site that has other pages to serve. Two reads in a row —
// the most one request makes when all is well — still end inside the fifteen seconds after
// which the page gives up on its own.
const SILEX_TRIPS_TIMEOUT   = 6;
// The longest wait this server passes on from the installation in a Retry-After.
const SILEX_TRIPS_RETRY_MAX = 600;

/**
 * The name of one cached answer, under the current cache generation.
 *
 * "Forget everything" cannot be done by deleting rows: with a persistent object cache (a
 * Redis or Memcached plugin, common on shared hosts) transients live in that cache and not
 * in wp_options, so a DELETE there matches nothing and get_transient() keeps answering the
 * old link's data until its own lifetime runs out. The site runs without one today; the day
 * one is installed, the flush button and "a changed link takes effect now" would go quiet
 * with no sign. So every key carries a generation number, and forgetting is bumping it: the
 * next read of anything looks under a name nothing was ever stored under, on any backend.
 * What was stored under the old names lapses by its own lifetime (an hour at most), and the
 * DELETE below still clears it at once where the rows are in wp_options.
 */
function silex_trips_key( $name ) {
	return 'silex_trips_' . (int) get_option( SILEX_TRIPS_GENERATION, 0 ) . '_' . $name;
}

/**
 * The name of one remembered fact about a link or a group of links.
 *
 * What it is about goes in hashed. A database compares option names without regard to case,
 * so two groups an administrator told apart by a capital letter would otherwise share one
 * memory — the remembered link of one cave answering for the other.
 */
function silex_trips_memo_key( $what, $about ) {
	return silex_trips_key( $what . '_' . md5( (string) $about ) );
}

function silex_trips_config() {
	$raw = get_option( SILEX_TRIPS_OPTION );
	$cfg = is_array( $raw ) ? $raw : array();
	return array(
		'base'  => isset( $cfg['base'] ) ? rtrim( (string) $cfg['base'], '/' ) : '',
		'slots' => ( isset( $cfg['slots'] ) && is_array( $cfg['slots'] ) ) ? $cfg['slots'] : array(),
		// The links as the administrator typed them, notes and blank lines included.
		'text'  => ( isset( $cfg['text'] ) && is_string( $cfg['text'] ) ) ? $cfg['text'] : null,
	);
}

/**
 * The token a slot names, or null.
 *
 * A slot is a name the page uses ("cave-1"); the token never appears in a page, a URL or a
 * log. Looking it up by exact key is also what makes this proxy unable to be pointed
 * anywhere else: there is no path from a request parameter to a host name.
 */
function silex_trips_token( $slot ) {
	$cfg = silex_trips_config();
	return isset( $cfg['slots'][ $slot ] ) && '' !== $cfg['slots'][ $slot ]
		? (string) $cfg['slots'][ $slot ]
		: null;
}

/**
 * The group a slot belongs to: its name without a final "-<number>".
 *
 * "cave-1" to "cave-5" are five links of one cave and one group, "cave". The lists and the
 * tracks are asked through a group's links in turn, and that is right only between links of
 * one cave: the installation answers each link about that link's cave, so walking on from a
 * refused link of one cave to a link of another answers the first cave's page with the
 * second cave's party. A site holding links of two caves names them differently, and nothing
 * here ever crosses from one name to the other.
 */
function silex_trips_group( $slot ) {
	$group = preg_replace( '/-[0-9]+$/', '', (string) $slot );
	return '' === $group ? (string) $slot : $group;
}

/** The links of one group, slot name => token, in the order the settings hold them. */
function silex_trips_links( $group ) {
	$cfg   = silex_trips_config();
	$links = array();
	foreach ( $cfg['slots'] as $name => $token ) {
		if ( '' !== (string) $token && silex_trips_group( $name ) === $group ) {
			$links[ $name ] = (string) $token;
		}
	}
	return $links;
}

/** The HTTP status a failed read carries, or 0 for a value that is not a failure. */
function silex_trips_error_status( $result ) {
	if ( ! is_wp_error( $result ) ) {
		return 0;
	}
	$data = $result->get_error_data();
	return ( is_array( $data ) && isset( $data['status'] ) ) ? (int) $data['status'] : 500;
}

function silex_trips_refused() {
	return new WP_Error( 'silex_trips_refused', 'The trip is not available.', array( 'status' => 404 ) );
}

function silex_trips_unreachable() {
	return new WP_Error( 'silex_trips_unreachable', 'The installation could not be reached.', array( 'status' => 503 ) );
}

function silex_trips_unknown_slot() {
	return new WP_Error( 'silex_trips_unknown_slot', 'No such trip.', array( 'status' => 404 ) );
}

/**
 * What every read of the installation is sent with.
 *
 * The reader's address goes along as X-Forwarded-For, so that an installation whose operator
 * has named this server as a proxy it trusts can count each reader against a budget of their
 * own instead of counting the whole readership as this one server. An installation that has
 * not been told so ignores the header, and nothing changes.
 *
 * It is the address of the connection as this server saw it, and nothing else. A header the
 * caller wrote — X-Forwarded-For, Forwarded, Client-IP, X-Real-IP — is the caller's own claim
 * about who they are; copied along, it would let anybody choose the address they are counted
 * under, which is a fresh budget per request. And anything that is not one plain address is
 * not sent at all, so that no byte of a request can become a second header line.
 */
function silex_trips_request_headers() {
	$headers = array( 'Accept' => 'application/json' );
	$reader  = ( isset( $_SERVER['REMOTE_ADDR'] ) && is_string( $_SERVER['REMOTE_ADDR'] ) ) ? $_SERVER['REMOTE_ADDR'] : '';
	if ( false !== filter_var( $reader, FILTER_VALIDATE_IP ) ) {
		$headers['X-Forwarded-For'] = $reader;
	}
	return $headers;
}

/**
 * A Retry-After as whole seconds from now, or 0 where it says nothing usable.
 *
 * Seconds, or the one date format HTTP writes. The date is parsed against that format and
 * not by a general date reader, which takes "-5" and "tomorrow" for dates. Longer than ten
 * minutes is cut to ten: the number ends up deciding when every open article asks again, and
 * that is not something to let one answer set for an hour.
 */
function silex_trips_retry_after( $value ) {
	$value = trim( (string) ( is_array( $value ) ? reset( $value ) : $value ) );
	if ( '' === $value ) {
		return 0;
	}
	if ( preg_match( '/^[0-9]+$/', $value ) ) {
		$seconds = (int) substr( $value, 0, 9 );
	} else {
		$when = DateTime::createFromFormat( '!D, d M Y H:i:s \G\M\T', $value, new DateTimeZone( 'UTC' ) );
		if ( false === $when ) {
			return 0;
		}
		$seconds = $when->getTimestamp() - time();
	}
	return $seconds < 1 ? 0 : min( SILEX_TRIPS_RETRY_MAX, $seconds );
}

/**
 * An answer without the signed addresses of the installation's files.
 *
 * Beside a trip and beside a finished trip's track the installation describes the survey the
 * positions are drawn on, in a block of its own: where the model's file is, pictures taken at
 * stations, scanned maps — each as an address carrying a signature that opens that file to
 * whoever presents it, for some minutes. The rest of the block (the places the cave declares,
 * how the model is anchored) is plain description and is kept.
 *
 * Recognised by what makes it a claim — the signature in the address — rather than by the
 * name of the field it sits in, so that a signed address the installation adds later under a
 * new name is taken out as well.
 */
function silex_trips_without_signed_addresses( $answer ) {
	if ( isset( $answer['model'] ) && is_array( $answer['model'] ) ) {
		$answer['model'] = silex_trips_unsigned( $answer['model'] );
	}
	return $answer;
}

function silex_trips_unsigned( $value ) {
	// A list stays a list: taking one member out of the middle would otherwise leave gaps in
	// its numbering, and the page would be sent an object where it was promised an array.
	$is_list = ( array() === $value ) || ( array_keys( $value ) === range( 0, count( $value ) - 1 ) );
	foreach ( $value as $key => $member ) {
		if ( is_array( $member ) ) {
			$value[ $key ] = silex_trips_unsigned( $member );
		} elseif ( is_string( $member ) && preg_match( '/[?&]token=/', $member ) ) {
			unset( $value[ $key ] );
		}
	}
	return $is_list ? array_values( $value ) : $value;
}

/**
 * One read of the installation, with nothing kept and nothing remembered: the answer, or the
 * failure it was.
 */
function silex_trips_request( $base, $path ) {
	$response = wp_remote_get( $base . $path, array(
		'timeout'     => SILEX_TRIPS_TIMEOUT,
		'redirection' => 0,
		'headers'     => silex_trips_request_headers(),
	) );

	if ( is_wp_error( $response ) ) {
		return silex_trips_unreachable();
	}

	$code = (int) wp_remote_retrieve_response_code( $response );

	// A refusal is passed on as a refusal: a revoked link, a trip that has left the archive
	// and a token that was never real all answer the same way.
	if ( 404 === $code ) {
		return silex_trips_refused();
	}

	// Anything else that is not an answer — the installation restarting, its rate limiter
	// refusing this server for a minute, a fault of its own — is a different thing from a
	// refusal, and the two have to stay distinguishable to whoever reads this error. A 404
	// says "this route, or this link, is not there", which is a fact about the installation
	// that may be acted on (and is, below, to decide whether it has a list route at all).
	// Everything else says nothing about the installation and must not be acted on as if
	// it did. The upstream status travels along so a log can tell them apart, and so does
	// the installation's own word on when to ask again, where it gave one.
	if ( 200 !== $code ) {
		$data  = array( 'status' => 503, 'upstream' => $code );
		$after = silex_trips_retry_after( wp_remote_retrieve_header( $response, 'retry-after' ) );
		if ( $after > 0 ) {
			$data['retry_after'] = $after;
		}
		return new WP_Error( 'silex_trips_unavailable', 'The installation did not answer.', $data );
	}

	$data = json_decode( wp_remote_retrieve_body( $response ), true );
	if ( ! is_array( $data ) ) {
		return new WP_Error( 'silex_trips_unreadable', 'The installation sent something unreadable.', array( 'status' => 502 ) );
	}

	return silex_trips_without_signed_addresses( $data );
}

/**
 * One read of the installation on behalf of a group of links, unless it is known not to
 * answer.
 *
 * An installation whose machine is down mostly does not refuse a connection, it lets it wait,
 * and every request that asks holds a PHP process for the whole timeout. Asking again a moment
 * later tells nobody anything the wait before it did not, so that is remembered for a short
 * while, and what would have to ask is answered at once with the same failure.
 *
 * One read that got no answer is not yet anything, though. A read can be slow once — the
 * first after the installation restarts — and be answered in a moment when it is made again;
 * refusing it for the length of a memory would stop the party's positions on the page over
 * one slow answer. So the first is only put on record, under the address asked for, and the
 * same read is not made again for a short while once it has got no answer twice running. An
 * answer of any kind takes the record off.
 *
 * One read failing over and over is still that read's own trouble — an archive the
 * installation cannot put together, a trip too long to be sent in time — and stops nothing
 * else being asked. The installation is taken to be down, and nothing of the group is asked
 * for a short while, when two different reads in a row got no answer: the group's record
 * names the read that put it there, and it is another read failing, begun while that record
 * stood, that stops the group. An answer to anything takes this record off as well. Reads
 * that were on their way together did not begin with one another on record, and so are not
 * one after the other.
 *
 * Both records are kept much longer than the silence they lead to, so that while the trouble
 * lasts, the first read after each silence finds the record standing and is the only one
 * waited for: one wait per short while, whoever and however many are asking.
 *
 * `$weighs` is false for the one read whose failure says nothing of the installation however
 * it is counted, a finished trip's track. It is the only read whose cost is chosen by whoever
 * asks — anybody may ask for the longest trips in the archive, one after another — so it has
 * a record of its own like any read and is never put on the group's. (The addresses a
 * track's record is kept under cannot be multiplied by a caller: a track is only ever asked
 * for when the archive lists it.)
 *
 * Only silence is remembered. An installation that did answer, with a fault or with its
 * limiter's refusal, is asked again by the next read, since it may well answer that one.
 */
function silex_trips_ask( $group, $path, $weighs = true ) {
	$cfg = silex_trips_config();
	if ( '' === $cfg['base'] ) {
		return new WP_Error( 'silex_trips_unconfigured', 'No SilexGIS installation is configured.', array( 'status' => 503 ) );
	}

	// The group's record — until when nothing of it is asked, and which read said so — and
	// this read's own, which is that time alone. A time already past is one read on record,
	// and refuses nothing.
	$down  = silex_trips_memo_key( 'down', $group );
	$slow  = silex_trips_memo_key( 'slow', $path );
	$whole = get_transient( $down );
	$whole = ( is_array( $whole ) && isset( $whole['until'], $whole['by'] ) ) ? $whole : false;
	$own   = get_transient( $slow );
	$now   = microtime( true );
	if ( ( false !== $whole && $now < (float) $whole['until'] ) || ( false !== $own && $now < (float) $own ) ) {
		return silex_trips_unreachable();
	}

	$answer = silex_trips_request( $cfg['base'], $path );
	if ( ! is_wp_error( $answer ) || 'silex_trips_unreachable' !== $answer->get_error_code() ) {
		if ( false !== $whole ) {
			delete_transient( $down );
		}
		if ( false !== $own ) {
			delete_transient( $slow );
		}
		return $answer;
	}

	$now = microtime( true );
	set_transient( $slow, $now + ( false === $own ? 0 : SILEX_TRIPS_TTL_MEMO ), SILEX_TRIPS_TTL_RECORD );
	if ( $weighs ) {
		$read = md5( $path );
		if ( false === $whole ) {
			set_transient( $down, array( 'until' => $now, 'by' => $read ), SILEX_TRIPS_TTL_RECORD );
		} elseif ( $whole['by'] !== $read ) {
			set_transient( $down, array( 'until' => $now + SILEX_TRIPS_TTL_MEMO, 'by' => $read ), SILEX_TRIPS_TTL_RECORD );
		}
	}
	return $answer;
}

/**
 * A kept answer — array( 'at' => when the read that brought it began, 'data' => the answer )
 * — or null.
 *
 * The time is the moment the read began, not the moment it was stored: an answer says what
 * was true when the installation was asked, and everything that judges how old a copy is
 * (what a browser is told, whether the archive predates the moment it was forgotten) is
 * judging that.
 */
function silex_trips_kept( $cache_key ) {
	// The name carries the shape of what is stored under it, so that a copy written by an
	// earlier version of this file — the bare answer — is never read as one of these.
	$kept = get_transient( silex_trips_key( md5( 'at|' . $cache_key ) ) );
	return ( is_array( $kept ) && isset( $kept['at'] ) && array_key_exists( 'data', $kept ) ) ? $kept : null;
}

function silex_trips_keep( $cache_key, $began, $data, $ttl ) {
	$kept = array( 'at' => (float) $began, 'data' => $data );
	set_transient( silex_trips_key( md5( 'at|' . $cache_key ) ), $kept, $ttl );
	return $kept;
}

/**
 * One link's own trip, kept per link.
 *
 * A link that refuses is remembered as refusing for a short while. Never keeping a refusal
 * sounds safer — a renewed link should answer at once — but a renewed link is a new token,
 * saved on the settings screen, and saving forgets everything; what a refusal never kept
 * actually bought was one read of the installation per request for every dead link, for as
 * long as it stayed in the settings.
 *
 * `$afresh` reads past a kept answer (a remembered refusal still stands): for the one caller
 * that has to know what the link says now rather than what it said a few seconds ago.
 */
function silex_trips_own( $token, $group, $afresh = false ) {
	$cache_key = 'own:' . $token;
	if ( ! $afresh ) {
		$kept = silex_trips_kept( $cache_key );
		if ( null !== $kept ) {
			return $kept;
		}
	}

	$gone = silex_trips_memo_key( 'gone', $token );
	if ( false !== get_transient( $gone ) ) {
		return silex_trips_refused();
	}

	$began  = microtime( true );
	$answer = silex_trips_ask( $group, '/api/v1/public/trips/' . rawurlencode( $token ) );
	if ( is_wp_error( $answer ) ) {
		if ( 404 === silex_trips_error_status( $answer ) ) {
			set_transient( $gone, microtime( true ), SILEX_TRIPS_TTL_MEMO );
		}
		return $answer;
	}
	return silex_trips_keep( $cache_key, $began, $answer, SILEX_TRIPS_TTL_LIVE );
}

/**
 * One question of the cave, asked through the links of the named slot's group in turn until
 * one answers.
 *
 * The archive and a finished trip's track are the same answer whichever link of the cave
 * opens them — every trip in them is drawn on the survey it was itself measured on — and
 * every link the group holds is a valid way of asking. (The list of the trips being
 * followed is not such an answer, and is not read here: see silex_trips_followed_list.)
 *
 * A link that has been revoked or has lapsed answers 404, which is a fact about that link
 * and not about the cave: an administrator who rotates the first link because it leaked has
 * three good ones left, and without this the page would lose the whole archive over it. So
 * a 404 moves on to the next link; anything else is a failure of the read and is returned as
 * it is, because an installation that is down is down through every link and four refused
 * requests say no more than one. When every link refuses, that is returned.
 *
 * The answer is kept for the group, not for the link it came through — it is the cave's
 * answer — so a copy that is still good is used before any link is asked, whichever slot the
 * page named. And the link that answered is remembered and asked first the next time:
 * otherwise a page naming a dead link costs a refused read on every poll before the good
 * link is reached, and on the day the installation is counting, that refused read is the one
 * its limiter turns away while the answer sits here unread.
 *
 * `$suffix` is what follows the token in the installation's path ('/past', or '/past/' and a
 * trip's identifier) and `$kind` says which question it is. `$afresh` reads past a kept
 * copy. Returns a kept answer (see silex_trips_kept; 'fresh' is set when the installation
 * was asked just now) or the failure.
 */
function silex_trips_group_read( $slot, $suffix, $kind, $ttl, $afresh = false ) {
	$group     = silex_trips_group( $slot );
	$cache_key = $kind . ':' . $group . $suffix;

	// The archive can be forgotten ahead of its time, and that is done with a mark rather
	// than a delete: a read of the archive already on its way when it is forgotten would
	// store its answer after the delete, and be served for five minutes as if nothing had
	// happened. A kept archive counts only if the read that brought it began after the mark.
	$forgotten = ( 'past' === $kind ) ? get_transient( silex_trips_memo_key( 'pastdrop', $group ) ) : false;

	if ( ! $afresh ) {
		$kept = silex_trips_kept( $cache_key );
		if ( null !== $kept && ( false === $forgotten || $kept['at'] > (float) $forgotten ) ) {
			return $kept;
		}
	}

	// Every link refusing a list is remembered for a short while, like one link refusing
	// its own trip. Not so for a track: its refusals are not remembered under the
	// identifier asked for, because anybody can ask for any identifier and each would
	// become a row in this site's database — a track is instead only ever asked for when
	// the archive lists it (see silex_trips_track).
	$none = ( 'track' === $kind ) ? null : silex_trips_memo_key( 'none', $cache_key );
	if ( null !== $none && false !== get_transient( $none ) ) {
		return silex_trips_refused();
	}

	$links   = silex_trips_links( $group );
	$lead_at = silex_trips_memo_key( 'lead', $group );
	$lead    = (string) get_transient( $lead_at );

	// The link that answered last, then the one the page named, then the rest as the
	// settings order them.
	$order = array();
	foreach ( array( $lead, (string) $slot ) as $first ) {
		if ( isset( $links[ $first ] ) ) {
			$order[ $first ] = $links[ $first ];
		}
	}
	$order += $links;

	$last  = silex_trips_refused();
	$asked = array();
	foreach ( $order as $name => $token ) {
		if ( isset( $asked[ $token ] ) ) {
			continue;
		}
		$asked[ $token ] = true;

		$began  = microtime( true );
		$answer = silex_trips_ask( $group, '/api/v1/public/trips/' . rawurlencode( $token ) . $suffix, 'track' !== $kind );
		if ( ! is_wp_error( $answer ) ) {
			if ( (string) $name !== $lead ) {
				set_transient( $lead_at, (string) $name, SILEX_TRIPS_TTL_SHAPE );
			}
			$kept          = silex_trips_keep( $cache_key, $began, $answer, $ttl );
			$kept['fresh'] = true;
			return $kept;
		}

		$last = $answer;
		if ( 404 !== silex_trips_error_status( $answer ) ) {
			return $answer;
		}
	}

	if ( null !== $none ) {
		set_transient( $none, microtime( true ), SILEX_TRIPS_TTL_MEMO );
	}
	if ( 'past' === $kind ) {
		// Refused through every link: whatever archive is still kept is one the
		// installation no longer stands behind — the cave has been protected, or the last
		// link revoked — and it stops being served now rather than when its time is up.
		silex_trips_forget_archive( $group );
	}
	return $last;
}

/**
 * The list of the trips being followed, as the installation gives it to the link the page
 * named.
 *
 * Unlike the archive and a track, this list is not one answer for the cave. The installation
 * places every party in it against the survey of the link that asks — the survey that link's
 * page has loaded — and a party measured on another survey of the same cave comes back with
 * no station, marked as recorded elsewhere. Two links of one cave on two surveys are
 * therefore given two different lists, and a page handed the other link's shows its party
 * off the model while its own link would have placed it. So the link asked is the named
 * slot's own, and what it answers is kept under that link and served to that link's slot.
 *
 * Another link of the group answers only in its place. When the named link refuses the list
 * — a 404: revoked, lapsed — the link that answered last and then the rest are asked: a list
 * placed on another survey still names every trip of the cave being followed, and not losing
 * all of it over one rotated link is what a group is for. A copy still kept under the link
 * standing in is used before anything is asked.
 *
 * A link that refused the list is remembered for an hour and asked after the others for as
 * long, so that a dead link the page names costs one refused read an hour and not one on
 * every poll. That memory only ever changes the order of asking, never whether a link is
 * asked: when no other link answers, the ones remembered as refusing are asked as well. A
 * refusal returned from here therefore means every link refused within the last short while,
 * which is what the caller decides the installation's shape on — and a list that comes back,
 * through any link, is on the page as soon as that short while is over. When it comes back
 * through a link remembered as refusing, the memory of every link of the group is let go
 * with it: links that refused together — a cave protected for an afternoon — answer
 * together again, and each page is then asked for through its own link, not through the
 * one that happened to be found first.
 *
 * Returns a kept answer (see silex_trips_kept; 'fresh' is set when the installation was asked
 * just now) or the failure.
 */
function silex_trips_followed_list( $slot ) {
	$slot  = (string) $slot;
	$group = silex_trips_group( $slot );
	$links = silex_trips_links( $group );

	// The ordinary read: the named link's own copy, before anything else is looked at.
	if ( isset( $links[ $slot ] ) ) {
		$kept = silex_trips_kept( 'livelist:' . $links[ $slot ] );
		if ( null !== $kept ) {
			return $kept;
		}
	}

	$none = silex_trips_memo_key( 'none', 'livelist:' . $group );
	if ( false !== get_transient( $none ) ) {
		return silex_trips_refused();
	}

	$lead_at = silex_trips_memo_key( 'lead', $group );
	$lead    = (string) get_transient( $lead_at );

	// The link the page named, then the one that answered last, then the rest as the
	// settings order them.
	$order = array();
	foreach ( array( $slot, $lead ) as $first ) {
		if ( isset( $links[ $first ] ) ) {
			$order[ $first ] = $links[ $first ];
		}
	}
	$order += $links;

	// Twice through: the links not remembered as refusing, then the ones that are.
	$met      = array();
	$refusing = array();
	foreach ( array( false, true ) as $again ) {
		foreach ( $again ? $refusing : $order as $name => $token ) {
			$name = (string) $name;
			if ( ! $again ) {
				// A link held under two names is one link.
				if ( isset( $met[ $token ] ) ) {
					continue;
				}
				$met[ $token ] = true;
				if ( $name !== $slot ) {
					$kept = silex_trips_kept( 'livelist:' . $token );
					if ( null !== $kept ) {
						return $kept;
					}
				}
				if ( false !== get_transient( silex_trips_memo_key( 'nolist', $token ) ) ) {
					$refusing[ $name ] = $token;
					continue;
				}
			}

			$began  = microtime( true );
			$answer = silex_trips_ask( $group, '/api/v1/public/trips/' . rawurlencode( $token ) . '/live' );
			if ( ! is_wp_error( $answer ) ) {
				if ( $again ) {
					// A link remembered as refusing has answered, so something changed at
					// the installation, and what is remembered of the other links is as
					// old and as doubtful. All of it goes: each is asked for itself again.
					foreach ( $links as $other ) {
						delete_transient( silex_trips_memo_key( 'nolist', $other ) );
					}
				}
				// Remembered as the link to begin with when it stood in for another. The
				// named link answering for itself changes nothing for anybody else, and
				// writing it down would have two pages that name two links rewrite the
				// memory at each other on every read.
				if ( $name !== $slot && $name !== $lead ) {
					set_transient( $lead_at, $name, SILEX_TRIPS_TTL_SHAPE );
				}
				$kept          = silex_trips_keep( 'livelist:' . $token, $began, $answer, SILEX_TRIPS_TTL_LIVE );
				$kept['fresh'] = true;
				return $kept;
			}
			if ( 404 !== silex_trips_error_status( $answer ) ) {
				return $answer;
			}
			if ( ! $again ) {
				set_transient( silex_trips_memo_key( 'nolist', $token ), microtime( true ), SILEX_TRIPS_TTL_SHAPE );
			}
		}
	}

	set_transient( $none, microtime( true ), SILEX_TRIPS_TTL_MEMO );
	return silex_trips_refused();
}

/** Stop serving the kept archive of a group, whatever time it had left. */
function silex_trips_forget_archive( $group ) {
	// Kept a little longer than an archive is, so that it outlives any copy made before it.
	set_transient( silex_trips_memo_key( 'pastdrop', $group ), microtime( true ), SILEX_TRIPS_TTL_PAST + 60 );
}

/**
 * Notice which trips a fresh list of the followed ones carries, and forget the archive when
 * one has left it.
 *
 * The installation's two lists share a trip between them: two days after its watch closes a
 * trip stops being followed and is history from the same instant. This server keeps the
 * followed list for twenty seconds and the archive for five minutes, so for up to five
 * minutes after that instant a reader would be shown a followed list that no longer has the
 * trip and an archive that does not have it yet — a trip in neither, which the page can only
 * read as "no longer published", said of a trip that is on the installation the whole time.
 * A trip leaving the followed list is exactly the moment the archive may have changed, so
 * that is when the kept archive is let go.
 *
 * Where nothing is remembered of the list before, nothing is known about what left it, and
 * the archive is let go as well: one read of the archive, against telling a reader that a
 * trip is gone.
 */
function silex_trips_note_followed( $group, $list ) {
	$now = array();
	if ( isset( $list['trips'] ) && is_array( $list['trips'] ) ) {
		foreach ( $list['trips'] as $row ) {
			if ( is_array( $row ) && isset( $row['tripLogId'] ) && is_string( $row['tripLogId'] ) && '' !== $row['tripLogId'] ) {
				$now[] = strtolower( $row['tripLogId'] );
			}
		}
	}
	sort( $now );

	$key    = silex_trips_memo_key( 'followed', $group );
	$before = get_transient( $key );
	if ( $before === $now ) {
		return;
	}
	if ( ! is_array( $before ) || array() !== array_diff( $before, $now ) ) {
		silex_trips_forget_archive( $group );
	}
	set_transient( $key, $now, SILEX_TRIPS_TTL_SHAPE );
}

/**
 * Every trip of the slot's cave that is still being followed — armed, or closed and inside
 * the window a closed watch goes on answering for.
 *
 * An installation new enough to have a list of them answers this in one call, and a new
 * trip then appears on the page without anyone editing anything. An older one has no
 * such route, and the same list is assembled here out of the links this site holds.
 *
 * The falling back happens on this side deliberately. A page that tried the list route
 * itself and fell back when it 404'd would work perfectly well and would log a failed
 * request to every reader's console on every visit — which is indistinguishable, to
 * anyone later reading those consoles for real faults, from something being broken.
 */
function silex_trips_followed( $slot ) {
	$group    = silex_trips_group( $slot );
	$shape_at = silex_trips_memo_key( 'shape', $group );
	$shape    = get_transient( $shape_at );

	if ( 'no' !== $shape ) {
		$list = silex_trips_followed_list( $slot );
		if ( ! is_wp_error( $list ) ) {
			if ( 'yes' !== $shape ) {
				set_transient( $shape_at, 'yes', SILEX_TRIPS_TTL_SHAPE );
			}
			if ( ! empty( $list['fresh'] ) ) {
				silex_trips_note_followed( $group, $list['data'] );
			}
			return $list;
		}
		// Only a 404 through every link can say the route is not there (a 404 through
		// one link is that link having lapsed, and the others were asked). Anything else —
		// the installation restarting, a minute of its rate limiter, a fault of its own —
		// says nothing about its shape, and is passed on as the failure it is. Falling back
		// on those would turn a total failure into a successful empty list, which the
		// page reads as "no trip of this cave is being followed", tells the reader the
		// trip they were watching is no longer published and takes the party off the
		// model; and remembering the wrong shape for an hour would keep serving the
		// links alone, hiding any trip without a slot, long after the trouble passed.
		if ( 404 !== silex_trips_error_status( $list ) ) {
			return $list;
		}
	}

	// A 404 through every link does not by itself say the route is missing either: it is
	// also what a group whose every link has lapsed looks like, and what any other web
	// server answers when the installation's address was saved wrongly. What does say it
	// is a link that refuses the list and, asked a moment later, answers for its own trip —
	// so the links are read past whatever is kept of them, and only an answer among them
	// decides the shape. An installation already known to have the list keeps being asked
	// for it: one round of refusals is its links lapsing, not the route disappearing.
	$undecided = ( 'yes' !== $shape && 'no' !== $shape );
	$list      = silex_trips_live_from_links( $group, $undecided );
	if ( is_wp_error( $list ) ) {
		return $list;
	}
	if ( $undecided && $list['answered'] > 0 ) {
		set_transient( $shape_at, 'no', SILEX_TRIPS_TTL_SHAPE );
	}
	silex_trips_note_followed( $group, $list['data'] );
	return $list;
}

/**
 * The same list, assembled from the links of one group.
 *
 * One read per link. A link that has lapsed is left out rather than failing the others: a
 * site holding four publications is holding four independent things, and three of them
 * working is three of them working.
 *
 * A link whose read failed is another matter, and is never left out. The page takes a list
 * that arrives as the whole list: a party missing from it is a party the page tells its
 * followers is no longer published, and takes off the model. So the list is an answer only
 * when every link that gave no trip said so itself, with a 404; one read that failed makes
 * the whole of it a failure, which the page keeps its last answer through and asks again.
 * And the first read that fails ends the round — the installation that did not answer one
 * link is not asked through the next.
 */
function silex_trips_live_from_links( $group, $afresh = false ) {
	$trips    = array();
	$answered = 0;
	$oldest   = null;

	foreach ( silex_trips_links( $group ) as $name => $token ) {
		$one = silex_trips_own( $token, $group, $afresh );
		if ( is_wp_error( $one ) ) {
			if ( 404 === silex_trips_error_status( $one ) ) {
				continue;
			}
			if ( 503 === silex_trips_error_status( $one ) ) {
				return $one;
			}
			return new WP_Error( 'silex_trips_unavailable', 'The installation did not answer.', array( 'status' => 503 ) );
		}

		$answered++;
		$oldest = ( null === $oldest ) ? $one['at'] : min( $oldest, $one['at'] );
		$trip   = $one['data'];
		// Shaped into a row of the list, so that everything downstream sees one shape
		// whichever of the two answered. The trip's own identifier is carried where the
		// installation sends one; without it a row is still its own row and its own link,
		// it simply cannot be recognised as the archive row it becomes when it closes.
		$trips[] = array(
			'tripLogId'         => isset( $trip['tripLogId'] ) ? $trip['tripLogId'] : null,
			// As text: a slot an administrator called "7" is a number to PHP by now, and
			// the page asks for a slot by the name it is given here.
			'slot'              => (string) $name,
			'title'             => isset( $trip['title'] ) ? $trip['title'] : null,
			'tripDate'          => isset( $trip['tripDate'] ) ? $trip['tripDate'] : null,
			'tripDateEnd'       => isset( $trip['tripDateEnd'] ) ? $trip['tripDateEnd'] : null,
			'state'             => isset( $trip['state'] ) ? $trip['state'] : null,
			'armedAt'           => isset( $trip['armedAt'] ) ? $trip['armedAt'] : null,
			'closedAt'          => isset( $trip['closedAt'] ) ? $trip['closedAt'] : null,
			'positionsWithheld' => ! empty( $trip['positionsWithheld'] ),
			'teams'             => isset( $trip['teams'] ) ? $trip['teams'] : array(),
			'participants'      => isset( $trip['participants'] ) ? $trip['participants'] : array(),
		);
	}

	return array(
		// As old as its oldest part; a list of nothing but remembered refusals is as old as
		// such a memory may be, and a browser is told to keep it for no time at all.
		'at'       => ( null === $oldest ) ? microtime( true ) - SILEX_TRIPS_TTL_LIVE : $oldest,
		// `more` is a bit and never a count, exactly as the installation's own lists are: how
		// many times a club has been into one cave is itself a disclosure.
		'data'     => array( 'trips' => $trips, 'more' => false ),
		'answered' => $answered,
	);
}

/** Whether an archive list carries a trip, by its identifier in lower case. */
function silex_trips_lists( $archive, $id ) {
	if ( ! isset( $archive['trips'] ) || ! is_array( $archive['trips'] ) ) {
		return false;
	}
	foreach ( $archive['trips'] as $row ) {
		if ( is_array( $row ) && isset( $row['tripLogId'] ) && is_string( $row['tripLogId'] ) && strtolower( $row['tripLogId'] ) === $id ) {
			return true;
		}
	}
	return false;
}

/**
 * One finished trip's track.
 *
 * Asked of the installation only for a trip the cave's archive lists. The route takes any
 * identifier anybody cares to write, and each one asked upstream is a read the installation
 * counts against this server whether or not such a trip exists — through every link in turn,
 * since a refusal moves on to the next. A loop of invented identifiers would spend in seconds
 * the budget every reader's page shares. The archive is a list this server holds anyway, so
 * an identifier that is not in it is refused here and costs the installation nothing.
 *
 * That makes the archive's age matter. A trip that has just become history is not in a list
 * read four minutes ago, and refusing its track would be telling the page it does not exist
 * at the moment the page asks precisely in order to find out. So an identifier missing from
 * a list older than a short while has the archive read once more before it is refused — once
 * per short while for the whole group, however many identifiers are asked for, so that the
 * invented ones still buy one read between them and not one each.
 *
 * The identifier is taken in lower case: the installation reads it as a GUID, to which case
 * means nothing, and every other spelling of one trip would otherwise be its own read of the
 * installation and its own kept copy of the track here.
 */
function silex_trips_track( $slot, $trip ) {
	$group = silex_trips_group( $slot );
	$id    = strtolower( (string) $trip );

	$archive = silex_trips_group_read( $slot, '/past', 'past', SILEX_TRIPS_TTL_PAST );
	if ( is_wp_error( $archive ) ) {
		return $archive;
	}

	$again = silex_trips_memo_key( 'reread', $group );
	if ( ! silex_trips_lists( $archive['data'], $id ) && microtime( true ) - $archive['at'] > SILEX_TRIPS_TTL_MEMO ) {
		$tried = get_transient( $again );
		if ( false === $tried ) {
			set_transient( $again, microtime( true ), SILEX_TRIPS_TTL_MEMO );
			$archive = silex_trips_group_read( $slot, '/past', 'past', SILEX_TRIPS_TTL_PAST, true );
			if ( is_wp_error( $archive ) ) {
				return $archive;
			}
		} elseif ( $archive['at'] < (float) $tried ) {
			// The archive was asked for again a moment ago and the list in hand is still the
			// old one, so that read failed. Nothing is known about this identifier, and
			// that is what is said — not "no such trip", which the page would act on.
			return new WP_Error( 'silex_trips_unavailable', 'The installation did not answer.', array( 'status' => 503 ) );
		}
	}

	if ( ! silex_trips_lists( $archive['data'], $id ) ) {
		return silex_trips_refused();
	}

	$track = silex_trips_group_read( $slot, '/past/' . $id, 'track', SILEX_TRIPS_TTL_TRACK );
	if ( 404 === silex_trips_error_status( $track ) ) {
		// Listed, and refused through every link: the trip left the archive after the list
		// was read. The list is let go, so that the next request reads it anew, finds the
		// trip gone from it and is refused here. Once per short while at most, and counted
		// apart from the reading-again above — a caller keeping that one busy with invented
		// identifiers must not be able to keep a list that is known to be wrong in service.
		$let_go = silex_trips_memo_key( 'letgo', $group );
		if ( false === get_transient( $let_go ) ) {
			set_transient( $let_go, microtime( true ), SILEX_TRIPS_TTL_MEMO );
			silex_trips_forget_archive( $group );
		}
	}
	return $track;
}

/**
 * A read as the answer the page gets: the failure as it is, or the data with how long a
 * browser may keep it.
 *
 * Never longer than the copy here has left, so a reader's browser cannot stretch the kept
 * time, and never longer than SILEX_TRIPS_BROWSER. "private", because the same response may
 * carry a cookie some other plugin sets, and nothing between this server and the reader has
 * any business keeping it.
 */
function silex_trips_answer( $read, $ttl ) {
	if ( is_wp_error( $read ) ) {
		return $read;
	}
	$left     = (int) floor( $ttl - ( microtime( true ) - $read['at'] ) );
	$response = new WP_REST_Response( $read['data'], 200 );
	$response->header( 'Cache-Control', 'private, max-age=' . max( 0, min( SILEX_TRIPS_BROWSER, $left ) ) );
	return $response;
}

add_action( 'rest_api_init', function () {
	$slot = '(?P<slot>' . SILEX_TRIPS_SLOT . ')';
	// A trip identifier is a UUID and nothing else is accepted, so a request parameter can
	// never become part of a path this server did not intend to ask for.
	$uuid = '(?P<trip>[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})';

	// Public, because what they proxy is public: the installation's own routes are anonymous
	// by design and the token that opens them is held here rather than by the caller.
	$open = '__return_true';

	register_rest_route( SILEX_CE_REST_NAMESPACE, '/trips/' . $slot, array(
		'methods'             => 'GET',
		'permission_callback' => $open,
		'callback'            => function ( $request ) {
			$slot  = (string) $request['slot'];
			$token = silex_trips_token( $slot );
			if ( null === $token ) {
				return silex_trips_unknown_slot();
			}
			return silex_trips_answer( silex_trips_own( $token, silex_trips_group( $slot ) ), SILEX_TRIPS_TTL_LIVE );
		},
	) );

	register_rest_route( SILEX_CE_REST_NAMESPACE, '/trips/' . $slot . '/live', array(
		'methods'             => 'GET',
		'permission_callback' => $open,
		'callback'            => function ( $request ) {
			$slot = (string) $request['slot'];
			if ( null === silex_trips_token( $slot ) ) {
				return silex_trips_unknown_slot();
			}
			return silex_trips_answer( silex_trips_followed( $slot ), SILEX_TRIPS_TTL_LIVE );
		},
	) );

	register_rest_route( SILEX_CE_REST_NAMESPACE, '/trips/' . $slot . '/past', array(
		'methods'             => 'GET',
		'permission_callback' => $open,
		'callback'            => function ( $request ) {
			$slot = (string) $request['slot'];
			if ( null === silex_trips_token( $slot ) ) {
				return silex_trips_unknown_slot();
			}
			return silex_trips_answer( silex_trips_group_read( $slot, '/past', 'past', SILEX_TRIPS_TTL_PAST ), SILEX_TRIPS_TTL_PAST );
		},
	) );

	register_rest_route( SILEX_CE_REST_NAMESPACE, '/trips/' . $slot . '/past/' . $uuid, array(
		'methods'             => 'GET',
		'permission_callback' => $open,
		'callback'            => function ( $request ) {
			$slot = (string) $request['slot'];
			if ( null === silex_trips_token( $slot ) ) {
				return silex_trips_unknown_slot();
			}
			return silex_trips_answer( silex_trips_track( $slot, $request['trip'] ), SILEX_TRIPS_TTL_TRACK );
		},
	) );
} );

/**
 * What a response of these routes says about being kept and about asking again.
 *
 * An answer states its own lifetime (see silex_trips_answer); whatever a session started
 * elsewhere on the site announced about caching is not about it, and the two leftovers of
 * that announcement which a later header does not replace are taken off. Anything that is
 * not an answer is not to be kept by anybody.
 *
 * And a failure that came with the installation's word on when to ask again passes that word
 * on. An error cannot carry a header of its own, which is why this is done here: the body
 * stays the one the page reads — a code, a message and the status — and the wait is added to
 * the response it has become. The page waits that long instead of climbing its own ladder of
 * retries, so that a whole readership does not come back together into a limiter that has
 * said when it will listen.
 */
function silex_trips_response_headers( $response, $server, $request ) {
	if ( ! is_object( $request ) || 0 !== strpos( (string) $request->get_route(), '/' . SILEX_CE_REST_NAMESPACE . '/trips/' ) ) {
		return $response;
	}
	if ( ! is_object( $response ) || ! method_exists( $response, 'header' ) ) {
		return $response;
	}

	if ( 200 === (int) $response->get_status() ) {
		if ( is_object( $server ) && method_exists( $server, 'remove_header' ) ) {
			$server->remove_header( 'Pragma' );
			$server->remove_header( 'Expires' );
		}
		return $response;
	}

	$response->header( 'Cache-Control', 'no-store' );

	$body = $response->get_data();
	if ( 503 === (int) $response->get_status() && is_array( $body ) && isset( $body['data'] ) && is_array( $body['data'] ) && isset( $body['data']['retry_after'] ) ) {
		$after = min( SILEX_TRIPS_RETRY_MAX, (int) $body['data']['retry_after'] );
		if ( $after > 0 ) {
			$response->header( 'Retry-After', (string) $after );
		}
	}
	return $response;
}
add_filter( 'rest_post_dispatch', 'silex_trips_response_headers', 10, 3 );

/* ---- the screen an administrator keeps the links on ---------------------------------- */

add_action( 'admin_menu', function () {
	add_options_page(
		__( 'Published trips (SilexGIS)', 'silexgis-caveview-3d' ),
		__( 'Published trips', 'silexgis-caveview-3d' ),
		'manage_options',
		'silex-cave-trips',
		'silex_trips_screen'
	);
} );

/**
 * The installation's address as it is kept: scheme, host and port, nothing after.
 *
 * '' for nothing typed, null for something that is not such an address. Every read appends
 * the installation's own path to this, so an address saved with a path of its own asks for a
 * path that does not exist — and whatever answers there with a 404 is then taken for an
 * installation whose links have all lapsed.
 */
function silex_trips_base_of( $typed ) {
	$typed = trim( (string) $typed );
	if ( '' === $typed ) {
		return '';
	}
	$parts = wp_parse_url( $typed );
	if ( ! is_array( $parts ) || empty( $parts['scheme'] ) || empty( $parts['host'] ) ) {
		return null;
	}
	$scheme = strtolower( $parts['scheme'] );
	if ( 'https' !== $scheme && 'http' !== $scheme ) {
		return null;
	}
	$base = esc_url_raw( $scheme . '://' . $parts['host'] . ( isset( $parts['port'] ) ? ':' . (int) $parts['port'] : '' ) );
	return '' === $base ? null : $base;
}

/**
 * The links as an administrator types them, read.
 *
 * One "name = token" a line. Blank lines and lines beginning with # are the administrator's
 * own notes — which link is which trip — and are neither links nor mistakes. Every other
 * line is either a link or a problem, and a problem is named by its line: a line that was
 * quietly skipped used to be a link that quietly was not saved.
 *
 * Returns array( 'slots' => name => token, 'problems' => sentences ).
 */
function silex_trips_parse_links( $text ) {
	$slots    = array();
	$problems = array();
	$seen     = array();

	foreach ( preg_split( '/\r\n|\r|\n/', (string) $text ) as $index => $line ) {
		$number = $index + 1;
		$line   = trim( $line );
		if ( '' === $line || 0 === strpos( $line, '#' ) ) {
			continue;
		}
		$parts = array_map( 'trim', explode( '=', $line, 2 ) );
		if ( 2 !== count( $parts ) || '' === $parts[0] || '' === $parts[1] ) {
			/* translators: %d: a line number */
			$problems[] = sprintf( __( 'line %d is not of the form “name = token”', 'silexgis-caveview-3d' ), $number );
			continue;
		}
		if ( ! preg_match( '/^' . SILEX_TRIPS_SLOT . '$/', $parts[0] ) ) {
			/* translators: %d: a line number */
			$problems[] = sprintf( __( 'line %d: a name may hold only letters without diacritics, digits, “_” and “-”, 40 characters at most — otherwise the page cannot ask for it', 'silexgis-caveview-3d' ), $number );
			continue;
		}
		if ( preg_match( '/\s/', $parts[1] ) ) {
			/* translators: %d: a line number */
			$problems[] = sprintf( __( 'line %d: the token contains spaces', 'silexgis-caveview-3d' ), $number );
			continue;
		}
		if ( isset( $seen[ $parts[0] ] ) ) {
			/* translators: 1: a line number, 2: the line the same name stands on */
			$problems[] = sprintf( __( 'line %1$d: the name is repeated (it is on line %2$d as well)', 'silexgis-caveview-3d' ), $number, $seen[ $parts[0] ] );
			continue;
		}
		$seen[ $parts[0] ]  = $number;
		$slots[ $parts[0] ] = $parts[1];
	}

	return array( 'slots' => $slots, 'problems' => $problems );
}

/**
 * The names that stand alone in their group, on a site that holds more than one link.
 *
 * Links answer for one another only inside a group, and a group is a name shared up to a
 * final "-<number>". Two links of one cave called "a" and "b", or "s1" and "s2", are two
 * groups of one: when the first stops answering nothing answers in its place, and its page
 * is told — truthfully, of that one link — that no trip is being followed, while the party
 * is underground through the second. Whether two such links are of one cave cannot be seen
 * from here, so it is said to the administrator, who can.
 */
function silex_trips_lone_names( $slots ) {
	$sizes = array();
	foreach ( $slots as $name => $token ) {
		if ( '' !== (string) $token ) {
			$group           = silex_trips_group( $name );
			$sizes[ $group ] = isset( $sizes[ $group ] ) ? $sizes[ $group ] + 1 : 1;
		}
	}
	$lone = array();
	if ( array_sum( $sizes ) > 1 ) {
		foreach ( $slots as $name => $token ) {
			if ( '' !== (string) $token && 1 === $sizes[ silex_trips_group( $name ) ] ) {
				$lone[] = (string) $name;
			}
		}
	}
	return $lone;
}

/** The same, as the sentence the screen shows; '' where no name stands alone. */
function silex_trips_lone_note( $slots ) {
	$lone = silex_trips_lone_names( $slots );
	if ( ! $lone ) {
		return '';
	}
	return sprintf(
		/* translators: %s: the names of the links, separated by commas */
		_n(
			'The link %s stands alone in its group: if it stops answering, no other link answers in its place, and the page that uses it shows that no trip is being followed.',
			'Each of the links %s stands alone in its group: if it stops answering, no other link answers in its place, and the page that uses it shows that no trip is being followed.',
			count( $lone ),
			'silexgis-caveview-3d'
		),
		implode( ', ', $lone )
	) . ' ' . __( 'The links of one cave carry the same name followed by -number (name-1, name-2).', 'silexgis-caveview-3d' );
}

/**
 * What the installation says of the links just saved: array( kind of notice, sentence ).
 *
 * "Saved" is true of the option and says nothing of whether the page will show anything. A
 * mistyped address is saved just as well as a right one, and what the reader then sees is
 * not an error but a page saying that no trip of the cave is being followed — so the
 * installation is asked here, once per link, and the notice says what it answered. These
 * reads go round the cache and leave nothing in it: they are the administrator's question,
 * not a reader's.
 */
function silex_trips_save_report( $base, $slots, $notes ) {
	$count = count( $slots );
	$tail  = $notes ? ' ' . implode( ' ', $notes ) : '';

	if ( '' === $base ) {
		/* translators: %d: how many links were saved */
		return array( 'warning', sprintf( _n( 'Saved: %d link, but without the installation\'s address: the pages get nothing until it is filled in.', 'Saved: %d links, but without the installation\'s address: the pages get nothing until it is filled in.', $count, 'silexgis-caveview-3d' ), $count ) . $tail );
	}
	if ( 0 === $count ) {
		return array( 'success', __( 'Saved: no links.', 'silexgis-caveview-3d' ) . $tail );
	}

	$dead = array();
	foreach ( $slots as $name => $token ) {
		// A link opens its own trip while that is being followed, and the cave's archive
		// once it is over; one that opens neither is dead.
		foreach ( array( '', '/past' ) as $suffix ) {
			$answer = silex_trips_request( $base, '/api/v1/public/trips/' . rawurlencode( $token ) . $suffix );
			if ( 404 !== silex_trips_error_status( $answer ) ) {
				break;
			}
		}
		if ( ! is_wp_error( $answer ) ) {
			continue;
		}
		if ( 404 === silex_trips_error_status( $answer ) ) {
			$dead[] = (string) $name;
			continue;
		}
		if ( 'silex_trips_unreachable' === $answer->get_error_code() ) {
			/* translators: %d: how many links were saved */
			return array( 'warning', sprintf( _n( 'Saved: %d link, but the installation could not be reached at the address given, so the link was not checked. Until it answers, the page says that the trips could not be loaded.', 'Saved: %d links, but the installation could not be reached at the address given, so the links were not checked. Until it answers, the page says that the trips could not be loaded.', $count, 'silexgis-caveview-3d' ), $count ) . $tail );
		}
		$data = $answer->get_error_data();
		return array( 'warning', sprintf(
			/* translators: 1: how many links were saved, 2: what the installation answered instead, e.g. "status 503" */
			_n( 'Saved: %1$d link, but the installation gave no answer just now (%2$s), so the link was not checked.', 'Saved: %1$d links, but the installation gave no answer just now (%2$s), so the links were not checked.', $count, 'silexgis-caveview-3d' ),
			$count,
			/* translators: %d: an HTTP status code */
			isset( $data['upstream'] ) ? sprintf( __( 'status %d', 'silexgis-caveview-3d' ), (int) $data['upstream'] ) : __( 'an answer that cannot be read', 'silexgis-caveview-3d' )
		) . $tail );
	}

	if ( count( $dead ) === $count ) {
		/* translators: %d: how many links were saved */
		return array( 'warning', sprintf( _n( 'Saved: %d link, but the installation answered 404 for it: either the address is not that of a SilexGIS installation, or the link has been revoked or has expired. Until this is corrected, the page says that no trip is being followed.', 'Saved: %d links, but the installation answered 404 for each of them: either the address is not that of a SilexGIS installation, or all the links have been revoked or have expired. Until this is corrected, the page says that no trip is being followed.', $count, 'silexgis-caveview-3d' ), $count ) . $tail );
	}
	if ( $dead ) {
		/* translators: 1: how many links were saved, 2: how many of them the installation answers for, 3: the names of the others */
		return array( 'warning', sprintf( _n( 'Saved: %1$d link; the installation answers for %2$d. No longer answering (revoked, expired or mistyped): %3$s.', 'Saved: %1$d links; the installation answers for %2$d. No longer answering (revoked, expired or mistyped): %3$s.', $count, 'silexgis-caveview-3d' ), $count, $count - count( $dead ), implode( ', ', $dead ) ) . $tail );
	}
	/* translators: %d: how many links were saved */
	return array( 'success', sprintf( _n( 'Saved: %d link; the installation answers for it.', 'Saved: %d links; the installation answers for all of them.', $count, 'silexgis-caveview-3d' ), $count ) . $tail );
}

function silex_trips_screen() {
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_die( esc_html__( 'You do not have the necessary permission.', 'silexgis-caveview-3d' ) );
	}

	$notice = '';
	$kind   = 'success';
	// What is shown in the two fields: what is saved, unless a save was just refused — then
	// what was typed, so that a refusal costs the administrator nothing they wrote.
	$typed_base  = null;
	$typed_links = null;

	if ( isset( $_POST['silex_trips_save'] ) && check_admin_referer( 'silex_trips' ) ) {
		$posted_base  = isset( $_POST['silex_trips_base'] ) ? wp_unslash( $_POST['silex_trips_base'] ) : '';
		$posted_links = isset( $_POST['silex_trips_slots'] ) ? wp_unslash( $_POST['silex_trips_slots'] ) : '';
		$posted_base  = is_string( $posted_base ) ? trim( $posted_base ) : '';
		$posted_links = is_string( $posted_links ) ? str_replace( array( "\r\n", "\r" ), "\n", $posted_links ) : '';

		$base     = silex_trips_base_of( $posted_base );
		$parsed   = silex_trips_parse_links( $posted_links );
		$problems = $parsed['problems'];
		if ( null === $base ) {
			array_unshift( $problems, __( 'the installation\'s address must be of the form https://domain', 'silexgis-caveview-3d' ) );
		}

		if ( $problems ) {
			// Nothing is saved, rather than what could be understood of it: a save
			// rewrites the whole list, and a list saved without the one line that had a
			// slip in it is a link taken off the page with a notice that says "saved".
			$kind        = 'error';
			/* translators: %s: what is wrong with the save, one problem after another */
			$notice      = sprintf( __( 'Nothing was saved: %s. The text below is the one that was sent.', 'silexgis-caveview-3d' ), implode( '; ', $problems ) );
			$typed_base  = $posted_base;
			$typed_links = $posted_links;
		} else {
			update_option(
				SILEX_TRIPS_OPTION,
				array( 'base' => $base, 'slots' => $parsed['slots'], 'text' => rtrim( $posted_links ) ),
				false
			);

			// A changed link must take effect now, not when the longest cache happens to lapse.
			silex_trips_forget();

			$notes = array();
			if ( 0 !== strcasecmp( $base, rtrim( $posted_base, '/' ) ) ) {
				$notes[] = __( 'Only the scheme and the domain of the address were kept.', 'silexgis-caveview-3d' );
			}
			if ( 0 === strpos( $base, 'http://' ) ) {
				$notes[] = __( 'The address is http: the links travel unencrypted between this server and the installation.', 'silexgis-caveview-3d' );
			}
			if ( '' !== silex_trips_lone_note( $parsed['slots'] ) ) {
				$notes[] = silex_trips_lone_note( $parsed['slots'] );
			}
			list( $kind, $notice ) = silex_trips_save_report( $base, $parsed['slots'], $notes );
		}
	}

	if ( isset( $_POST['silex_trips_flush'] ) && check_admin_referer( 'silex_trips' ) ) {
		silex_trips_forget();
		$notice = __( 'The cache has been emptied.', 'silexgis-caveview-3d' );
	}

	$cfg = silex_trips_config();

	// The tokens are shown back, because an administrator has to be able to check and
	// replace one — they are already in this administrator's own database, and hiding them
	// from the only screen that edits them would mean editing by deletion. Shown as they
	// were typed, notes included, as long as that text still says what the saved links
	// say; where the links were written by something else since, they are listed plainly.
	$text = '';
	foreach ( $cfg['slots'] as $name => $token ) {
		$text .= $name . ' = ' . $token . "\n";
	}
	if ( null !== $cfg['text'] ) {
		$as_typed = silex_trips_parse_links( $cfg['text'] );
		if ( ! $as_typed['problems'] && $as_typed['slots'] === $cfg['slots'] ) {
			$text = $cfg['text'] . "\n";
		}
	}
	if ( null !== $typed_links ) {
		$text = $typed_links;
	}

	// Said each time the screen is opened and not only after a save: links saved before
	// groups existed were never saved again, and stand alone just the same.
	$lone_note = silex_trips_lone_note( $cfg['slots'] );
	?>
	<div class="wrap">
		<h1><?php esc_html_e( 'Published trips (SilexGIS)', 'silexgis-caveview-3d' ); ?></h1>

		<?php if ( $notice ) : ?>
			<div class="notice notice-<?php echo esc_attr( $kind ); ?>"><p><?php echo esc_html( $notice ); ?></p></div>
		<?php endif; ?>

		<p>
			<?php
			printf(
				/* translators: 1 and 2: the start and the end of the emphasis on "is" */
				esc_html__( 'Every trip published in SilexGIS has a link of its own. The link %1$sis%2$s the key to it: whoever has it sees the page. That is why it is kept here, on the server, and not in the page the visitor reads.', 'silexgis-caveview-3d' ),
				'<strong>',
				'</strong>'
			);
			?>
		</p>
		<p>
			<strong><?php esc_html_e( 'A link saved here is public from that moment.', 'silexgis-caveview-3d' ); ?></strong>
			<?php
			printf(
				/* translators: %s: the address a link is read at through this site */
				esc_html__( 'The token never leaves the server, but what the installation shows through it — the trip, the party, the positions — can be read through this site by anybody who knows or guesses the link\'s name (%s), whether the page that uses it is published, a draft or protected by a password.', 'silexgis-caveview-3d' ),
				'<code>/wp-json/' . SILEX_CE_REST_NAMESPACE . '/trips/' . esc_html_x( 'name', 'a link\'s name, in an address', 'silexgis-caveview-3d' ) . '</code>'
			);
			?>
		</p>

		<form method="post">
			<?php wp_nonce_field( 'silex_trips' ); ?>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><label for="silex_trips_base"><?php esc_html_e( 'The installation\'s address', 'silexgis-caveview-3d' ); ?></label></th>
					<td>
						<input name="silex_trips_base" id="silex_trips_base" type="url" class="regular-text"
							value="<?php echo esc_attr( null !== $typed_base ? $typed_base : $cfg['base'] ); ?>" placeholder="<?php esc_attr_e( 'https://example.org', 'silexgis-caveview-3d' ); ?>">
						<p class="description">
							<?php esc_html_e( 'No path after it — only the scheme and the domain; whatever follows the domain is not kept. On saving, the installation is asked once for each link, and the message says what it answered.', 'silexgis-caveview-3d' ); ?>
						</p>
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="silex_trips_slots"><?php esc_html_e( 'Links', 'silexgis-caveview-3d' ); ?></label></th>
					<td>
						<textarea name="silex_trips_slots" id="silex_trips_slots" rows="8" class="large-text code"
							placeholder="cave-1 = ABCdef..."><?php echo esc_textarea( $text ); ?></textarea>
						<p class="description">
							<?php
							printf(
								/* translators: 1: the form of a line, 2: the configuration's field, 3 to 5: the characters named */
								esc_html__( 'One per line, in the form %1$s. The name appears in the page\'s configuration (%2$s) and may hold only letters without diacritics, digits, %3$s and %4$s, 40 characters at most; the token never leaves the server. Lines that begin with %5$s are notes and are kept as they were written. A line that cannot be understood stops the save and is named in the message: nothing is lost in silence.', 'silexgis-caveview-3d' ),
								'<code>' . esc_html__( 'name = token', 'silexgis-caveview-3d' ) . '</code>',
								'<code>slots</code>',
								'<code>_</code>',
								'<code>-</code>',
								'<code>#</code>'
							);
							?>
						</p>
						<p class="description">
							<?php
							$other = esc_html_x( 'other', 'the name of another cave\'s links, as in other-1', 'silexgis-caveview-3d' );
							printf(
								/* translators: 1: the ending of a name, 2 and 3: two names of one cave's links, 4 and 5: two of another cave's */
								esc_html__( 'The links of one cave carry the same name followed by %1$s (%2$s, %3$s, …) and form a group. The archive and the tracks are asked for through the first link of the group that answers, beginning with the one that answered last: a revoked or expired link does not hide the archive while the group still has a valid one. The list of the followed trips is asked for through the link the page names, because the installation places the parties on the survey of the link that asks; only when that one stops answering does the list come through another link of the group, and the parties measured on another survey then appear without a position on the model; a link that refused the list is asked, for an hour, only after the others. Another cave\'s links get another name (%4$s, %5$s): a group never answers through another group\'s links. A name without %1$s is a group of its own.', 'silexgis-caveview-3d' ),
								'<code>' . esc_html__( '-number', 'silexgis-caveview-3d' ) . '</code>',
								'<code>cave-1</code>',
								'<code>cave-2</code>',
								'<code>' . $other . '-1</code>',
								'<code>' . $other . '-2</code>'
							);
							?>
						</p>
						<?php if ( '' !== $lone_note ) : ?>
							<p class="description"><strong><?php echo esc_html( $lone_note ); ?></strong></p>
						<?php endif; ?>
					</td>
				</tr>
			</table>
			<p class="submit">
				<button type="submit" name="silex_trips_save" class="button button-primary"><?php esc_html_e( 'Save', 'silexgis-caveview-3d' ); ?></button>
				<button type="submit" name="silex_trips_flush" class="button"><?php esc_html_e( 'Empty the cache', 'silexgis-caveview-3d' ); ?></button>
			</p>
			<p class="description">
				<?php
				printf(
					/* translators: %s: the name of the button that empties the cache */
					esc_html__( 'The installation\'s answers are kept for a short time (a link\'s trip and the list of the followed trips 20 s, the archive 5 min, a finished trip\'s track 1 min). A corrected report, a revoked link or a cave made protected shows on the page after that long at the latest. The reader\'s browser may keep an answer as well, but for 20 s at most and never beyond the time the copy here has left: the two do not add up beyond the times above. A refusal by the installation is remembered for 20 s. If two different reads in a row get no answer, the installation is not asked for 20 s; if one and the same read gets no answer twice in a row — a long track, say — only that read is not made for 20 s, and the rest goes on. %s deletes the copies on this server at once; a browser that has just read an answer may still show it for 20 s at most. Saving empties it as well.', 'silexgis-caveview-3d' ),
					'<em>' . esc_html__( 'Empty the cache', 'silexgis-caveview-3d' ) . '</em>'
				);
				?>
			</p>
			<p class="description">
				<?php
				printf(
					/* translators: 1: a header's name, 2: a file's name, 3, 5 and 6: settings of the installation, 4: a setting of its web server, 7: a network mask */
					esc_html__( 'The installation counts requests per address, and every reader reaches it through this server, so as one single address. That is why this server sends the reader\'s address in %1$s; the installation takes it into account only if its operator declares this server a trusted proxy, in the installation\'s %2$s file: %3$s (one more than without this site: 3 under the TLS overlay, where the value is changed in the overlay\'s file and the address is also added to %4$s in the Caddyfile), %5$s the installation\'s Compose network (naming a network replaces the default list) and %6$s the address this server makes its requests from, with %7$s. Without these settings nothing changes. On shared hosting that address belongs to every site on the same server: declared trusted, any of them can present any address to the installation.', 'silexgis-caveview-3d' ),
					'<code>X-Forwarded-For</code>',
					'<code>.env</code>',
					'<code>SILEXGIS__Proxy__Hops=2</code>',
					'<code>trusted_proxies</code>',
					'<code>SILEXGIS__Proxy__TrustedNetworks__0=</code>',
					'<code>SILEXGIS__Proxy__TrustedNetworks__1=</code>',
					'<code>/32</code>'
				);
				?>
			</p>
		</form>
	</div>
	<?php
}

/** Forget every cached answer. */
function silex_trips_forget() {
	global $wpdb;
	// Move every key on: see silex_trips_key(). This is what forgets on any cache backend.
	update_option( SILEX_TRIPS_GENERATION, (int) get_option( SILEX_TRIPS_GENERATION, 0 ) + 1, true );

	// And clear the rows where they are rows. Transients in wp_options are rows like
	// `_transient_silex_trips_<generation>_<hash>`; there is no API for "everything with
	// this prefix", and the alternative — remembering every key written — would itself be
	// state that can go stale. Without this the old generation's rows would wait for their
	// own lifetime and the daily sweep of expired transients, which is harmless but untidy.
	$wpdb->query(
		$wpdb->prepare(
			"DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s",
			$wpdb->esc_like( '_transient_silex_trips_' ) . '%',
			$wpdb->esc_like( '_transient_timeout_silex_trips_' ) . '%'
		)
	);
}
