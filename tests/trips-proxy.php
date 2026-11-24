<?php
/**
 * The trips proxy, driven from its failing side.
 *
 * What the page reads through this proxy is a list, and a list has one failure that no amount
 * of reading the happy path shows: a total failure that comes back as a successful empty
 * answer. The page reads an empty list of followed trips as "nothing of this cave is being
 * followed", tells the reader the trip they were watching is no longer published and takes
 * the party off the model — a statement about the club assembled out of a network fault. So
 * the first cases here are ways the installation can fail to answer, and what is asserted is
 * that the proxy passes a failure on as a failure.
 *
 * The rest is what the proxy owes the installation and the administrator. The routes are open
 * to anybody, and the installation counts every read against the one address this server asks
 * from: so the cases count reads — what an invented trip identifier costs, what a dead link
 * costs per reader, what an installation that does not answer costs — and assert that none of
 * it grows with who is asking or how often. And the settings screen is driven with the saves
 * an administrator gets wrong, asserting that each is said and none is silently half-kept.
 *
 * Runs without WordPress: the functions the proxy calls are stubbed below, with the remote
 * answers scripted per path and a clock the cases move. No PHP is installed on the development
 * machine; the site's own PHP version runs from a container:
 *
 *   docker run --rm -v "$PWD":/w:ro php:7.4-cli php /w/tests/trips-proxy.php
 *
 * An optional argument names another copy of the proxy to drive (the default is the
 * plugin's own, includes/trips-proxy.php). Exits non-zero on failure.
 *
 * The last group can read a written record of the proxy — a document with a section "The trips
 * proxy" — and hold it to this file: the times it gives, the answers it promises, the names it
 * lists. A second argument names that document; with none, the group is skipped.
 */

define( 'ABSPATH', '/nonexistent/' );

// Whatever PHP has to say along the way is kept and is a failure of the run: on a site with
// debugging switched on, a notice is printed into the middle of a JSON answer.
error_reporting( E_ALL );
$GLOBALS['php_said'] = array();
set_error_handler( function ( $level, $message, $file, $line ) {
	$GLOBALS['php_said'][] = basename( $file ) . ':' . $line . ' ' . $message;
	return true;
} );

/* ---- the WordPress the proxy sees ----------------------------------------------------- */

class WP_Error {
	public $code; public $message; public $data;
	public function __construct( $code = '', $message = '', $data = '' ) {
		$this->code = $code; $this->message = $message; $this->data = $data;
	}
	public function get_error_code() { return $this->code; }
	public function get_error_message() { return $this->message; }
	public function get_error_data() { return $this->data; }
}
function is_wp_error( $x ) { return $x instanceof WP_Error; }

class WP_REST_Response {
	public $data; public $status; public $headers = array();
	public function __construct( $data = null, $status = 200, $headers = array() ) {
		$this->data = $data; $this->status = $status; $this->headers = $headers;
	}
	public function get_data() { return $this->data; }
	public function get_status() { return $this->status; }
	public function get_headers() { return $this->headers; }
	public function header( $key, $value, $replace = true ) { $this->headers[ $key ] = $value; }
}
// The two things a response filter is handed besides the response.
class Stub_Request {
	private $route;
	public function __construct( $route ) { $this->route = $route; }
	public function get_route() { return $this->route; }
}
class Stub_Server {
	public $removed = array();
	public function remove_header( $key ) { $this->removed[] = $key; }
}

$GLOBALS['stub'] = array(
	'now'        => 1000000.0, // the clock transients lapse by; advance() moves it
	'options'    => array(),
	'transients' => array(),   // key => array( value, lapses at )
	'ttls'       => array(),
	'answers'    => array(),   // path suffix => array( code, body [, headers] ) | 'unreachable'
	'upstream'   => null,      // or a function of the URL answering the same
	'requested'  => array(),   // every URL asked of the installation
	'sent'       => array(),   // and what each was sent with
	'times'      => array(),   // and when, by the clock above
	'routes'     => array(),
	'actions'    => array(),
	'filters'    => array(),
);

function get_option( $name, $default = false ) {
	return isset( $GLOBALS['stub']['options'][ $name ] ) ? $GLOBALS['stub']['options'][ $name ] : $default;
}
function update_option( $name, $value, $autoload = null ) {
	$GLOBALS['stub']['options'][ $name ] = $value;
	return true;
}
// The options table, as the proxy's flush addresses it. Its DELETE removes nothing here: the
// transients below stand in for a persistent object cache, where a transient is not a row.
$GLOBALS['wpdb'] = new class {
	public $options = 'wp_options';
	public $queries = array();
	public function prepare( $query, ...$args ) { return $query; }
	public function esc_like( $text ) { return $text; }
	public function query( $query ) { $this->queries[] = $query; return 0; }
};
// A transient lapses as WordPress lapses it: gone once its time is in the past. A number comes
// back as text, as it does from the options table, so that a time the proxy remembers is read
// the way the site will hand it back.
function get_transient( $key ) {
	if ( ! array_key_exists( $key, $GLOBALS['stub']['transients'] ) ) { return false; }
	list( $value, $until ) = $GLOBALS['stub']['transients'][ $key ];
	if ( $until < floor( $GLOBALS['stub']['now'] ) ) {
		unset( $GLOBALS['stub']['transients'][ $key ] );
		return false;
	}
	if ( is_float( $value ) ) { return sprintf( '%.6F', $value ); }
	return is_int( $value ) ? (string) $value : $value;
}
function set_transient( $key, $value, $ttl ) {
	$GLOBALS['stub']['transients'][ $key ] = array( $value, $ttl > 0 ? floor( $GLOBALS['stub']['now'] ) + $ttl : INF );
	$GLOBALS['stub']['ttls'][ $key ]       = $ttl;
	return true;
}
function delete_transient( $key ) {
	unset( $GLOBALS['stub']['transients'][ $key ], $GLOBALS['stub']['ttls'][ $key ] );
	return true;
}
function add_action( $hook, $fn ) { $GLOBALS['stub']['actions'][ $hook ][] = $fn; }
function add_filter( $hook, $fn, $priority = 10, $args = 1 ) { $GLOBALS['stub']['filters'][ $hook ][] = $fn; }
function register_rest_route( $ns, $route, $args ) { $GLOBALS['stub']['routes'][ $route ] = $args['callback']; }
function add_options_page() {}
function wp_remote_get( $url, $args ) {
	$GLOBALS['stub']['requested'][] = $url;
	$GLOBALS['stub']['sent'][]      = $args;
	$GLOBALS['stub']['times'][]     = $GLOBALS['stub']['now'];
	$answer = array( 404, '' );
	if ( null !== $GLOBALS['stub']['upstream'] ) {
		$answer = call_user_func( $GLOBALS['stub']['upstream'], $url );
	} else {
		foreach ( $GLOBALS['stub']['answers'] as $suffix => $scripted ) {
			if ( substr( $url, -strlen( $suffix ) ) === $suffix ) { $answer = $scripted; break; }
		}
	}
	if ( 'unreachable' === $answer ) {
		return new WP_Error( 'http_request_failed', 'cURL error 28: timed out' );
	}
	return array(
		'response' => array( 'code' => $answer[0] ),
		'body'     => $answer[1],
		'headers'  => isset( $answer[2] ) ? $answer[2] : array(),
	);
}
function wp_remote_retrieve_response_code( $r ) { return $r['response']['code']; }
function wp_remote_retrieve_body( $r ) { return $r['body']; }
function wp_remote_retrieve_header( $r, $name ) { return isset( $r['headers'][ $name ] ) ? $r['headers'][ $name ] : ''; }

// The settings screen's WordPress. An address is cleaned the way the site cleans one: kept
// when it is http or https, given http when it names no scheme at all, emptied otherwise.
function current_user_can( $capability ) { return true; }
function check_admin_referer( $action ) { return true; }
function wp_die( $message ) { throw new Exception( $message ); }
function wp_unslash( $value ) { return $value; }
function wp_nonce_field( $action ) { echo '<input type="hidden" id="_wpnonce" name="_wpnonce" value="nonce">'; }
function wp_parse_url( $url, $component = -1 ) { return parse_url( $url, $component ); }
function esc_url_raw( $url ) {
	$url = trim( (string) $url );
	if ( '' === $url || preg_match( '~^https?://~i', $url ) ) { return $url; }
	return false === strpos( $url, ':' ) ? 'http://' . $url : '';
}
function esc_attr( $text ) { return htmlspecialchars( (string) $text, ENT_QUOTES ); }
function esc_html( $text ) { return htmlspecialchars( (string) $text, ENT_QUOTES ); }
function esc_textarea( $text ) { return htmlspecialchars( (string) $text, ENT_QUOTES ); }
// The screen's words as WordPress hands them over with no translation loaded: the English the
// code is written in. (A site in another language gets them from the plugin's languages/.)
function __( $text, $domain = 'default' ) { return $text; }
function _x( $text, $context, $domain = 'default' ) { return $text; }
function _n( $single, $plural, $number, $domain = 'default' ) { return 1 == $number ? $single : $plural; }
function esc_html__( $text, $domain = 'default' ) { return esc_html( $text ); }
function esc_html_e( $text, $domain = 'default' ) { echo esc_html( $text ); }
function esc_html_x( $text, $context, $domain = 'default' ) { return esc_html( $text ); }
function esc_attr__( $text, $domain = 'default' ) { return esc_attr( $text ); }
function esc_attr_e( $text, $domain = 'default' ) { echo esc_attr( $text ); }

/* ---- load the proxy and collect its routes -------------------------------------------- */

$proxy = ( isset( $argv[1] ) && '-' !== $argv[1] ) ? $argv[1] : __DIR__ . '/../plugin/silexgis-caveview-3d/includes/trips-proxy.php';
// The plugin's main file defines these before it loads the proxy.
define( 'SILEX_CE_REST_NAMESPACE', 'silexgis-caveview/v1' );
// The record that is held to this file at the end; null for none.
$record = isset( $argv[2] ) ? ( '-' === $argv[2] ? null : $argv[2] ) : null;
require $proxy;
foreach ( $GLOBALS['stub']['actions']['rest_api_init'] as $fn ) { $fn(); }
// A copy of the proxy from before its keys carried a generation named them bare; driving
// such a copy (to watch the forgetting case fail) needs the same name for the shape key.
if ( ! function_exists( 'silex_trips_key' ) ) {
	function silex_trips_key( $name ) { return 'silex_trips_' . $name; }
}

$GLOBALS['routes'] = array( 'own' => null, 'live' => null, 'past' => null, 'track' => null );
$GLOBALS['patterns'] = array();
foreach ( $GLOBALS['stub']['routes'] as $pattern => $cb ) {
	if ( false !== strpos( $pattern, '/past/(' ) ) { $which = 'track'; }
	elseif ( substr( $pattern, -5 ) === '/live' ) { $which = 'live'; }
	elseif ( substr( $pattern, -5 ) === '/past' ) { $which = 'past'; }
	else { $which = 'own'; }
	$GLOBALS['routes'][ $which ]   = $cb;
	$GLOBALS['patterns'][ $which ] = $pattern;
}
foreach ( $GLOBALS['routes'] as $which => $cb ) {
	if ( ! $cb ) { echo "FAIL  no route registered for: $which\n"; exit( 1 ); }
}

/* ---- the cases ------------------------------------------------------------------------ */

$failures = array();
$checked  = 0;
function check( $name, $ok, $detail = '' ) {
	global $failures, $checked;
	$checked++;
	echo ( $ok ? 'ok    ' : 'FAIL  ' ) . $name . ( $ok || '' === (string) $detail ? '' : '  ' . $detail ) . "\n";
	if ( ! $ok ) { $failures[] = $name; }
}

const THREE_LINKS = array( 'aven-1' => 'tokenone', 'aven-2' => 'tokentwo', 'aven-3' => 'tokenthree' );

function reset_site( $answers, $shape = false, $slots = THREE_LINKS ) {
	$GLOBALS['stub']['transients'] = array();
	$GLOBALS['stub']['ttls']       = array();
	$GLOBALS['stub']['requested']  = array();
	$GLOBALS['stub']['sent']       = array();
	$GLOBALS['stub']['times']      = array();
	$GLOBALS['stub']['answers']    = $answers;
	$GLOBALS['stub']['upstream']   = null;
	$GLOBALS['stub']['options'][ SILEX_TRIPS_OPTION ] = array( 'base' => 'https://installation.invalid', 'slots' => $slots );
	$_SERVER = array();
	if ( false !== $shape ) { set_transient( shape_key(), $shape, 3600 ); }
}

// Where the proxy remembers whether the installation has a list route: per group of links,
// or under one bare name in a copy from before links had groups.
function shape_key( $group = 'aven' ) {
	return function_exists( 'silex_trips_memo_key' ) ? silex_trips_memo_key( 'shape', $group ) : silex_trips_key( 'shape' );
}
function shape( $group = 'aven' ) { return get_transient( shape_key( $group ) ); }

// Time passing. The proxy reads the real clock for the age of what it keeps, so moving the
// clock is moving every time it remembered back by as much — a kept answer's own time, and
// each bare time it keeps as a mark — besides letting transients lapse.
function advance( $seconds ) {
	$GLOBALS['stub']['now'] += $seconds;
	foreach ( $GLOBALS['stub']['transients'] as $key => $entry ) {
		if ( is_float( $entry[0] ) ) {
			$GLOBALS['stub']['transients'][ $key ][0] = $entry[0] - $seconds;
		} elseif ( is_array( $entry[0] ) && isset( $entry[0]['at'] ) && is_float( $entry[0]['at'] ) ) {
			$GLOBALS['stub']['transients'][ $key ][0]['at'] = $entry[0]['at'] - $seconds;
		} elseif ( is_array( $entry[0] ) && isset( $entry[0]['until'] ) && is_float( $entry[0]['until'] ) ) {
			$GLOBALS['stub']['transients'][ $key ][0]['until'] = $entry[0]['until'] - $seconds;
		}
	}
}

// One request of a route, answered as the REST server answers it: an error becomes a
// response with its code, message and data as the body and its status as the status, and
// the response then passes through whatever the proxy hooked onto every response.
function ask( $which, $slot = 'aven-1', $trip = null ) {
	$args   = null === $trip ? array( 'slot' => $slot ) : array( 'slot' => $slot, 'trip' => $trip );
	$result = call_user_func( $GLOBALS['routes'][ $which ], $args );
	if ( is_wp_error( $result ) ) {
		$data     = $result->get_error_data();
		$response = new WP_REST_Response(
			array( 'code' => $result->get_error_code(), 'message' => $result->get_error_message(), 'data' => $data ),
			( is_array( $data ) && isset( $data['status'] ) ) ? (int) $data['status'] : 500
		);
	} elseif ( $result instanceof WP_REST_Response ) {
		$response = $result;
	} else {
		$response = new WP_REST_Response( $result, 200 );
	}
	$tail = array( 'own' => '', 'live' => '/live', 'past' => '/past', 'track' => '/past/' . $trip );
	return filtered( $response, '/silexgis-caveview/v1/trips/' . $slot . $tail[ $which ] );
}
function filtered( $response, $route ) {
	$GLOBALS['stub']['server'] = new Stub_Server();
	$filters = isset( $GLOBALS['stub']['filters']['rest_post_dispatch'] ) ? $GLOBALS['stub']['filters']['rest_post_dispatch'] : array();
	foreach ( $filters as $fn ) {
		$response = call_user_func( $fn, $response, $GLOBALS['stub']['server'], new Stub_Request( $route ) );
	}
	return $response;
}
function header_of( $response, $name ) { return isset( $response->headers[ $name ] ) ? $response->headers[ $name ] : null; }
function code_of( $response ) { return ( is_array( $response->data ) && isset( $response->data['code'] ) ) ? $response->data['code'] : null; }
function max_age( $response ) {
	return preg_match( '/^private, max-age=(\d+)$/', (string) header_of( $response, 'Cache-Control' ), $m ) ? (int) $m[1] : null;
}
function reads() { return count( $GLOBALS['stub']['requested'] ); }

function describe( $response ) {
	if ( 200 !== $response->status ) {
		return $response->status . ' ' . code_of( $response ) . ' ' . json_encode( $response->headers );
	}
	return '200 ' . substr( json_encode( $response->data ), 0, 160 ) . ' ' . json_encode( $response->headers );
}

// What the proxy is keeping, without the time it may keep beside each answer.
function kept_answers() {
	$kept = array();
	foreach ( $GLOBALS['stub']['transients'] as $key => $entry ) {
		$value = $entry[0];
		$kept[ $key ] = ( is_array( $value ) && isset( $value['at'] ) && array_key_exists( 'data', $value ) ) ? $value['data'] : $value;
	}
	return $kept;
}

$envelope = function ( $id ) {
	return json_encode( array( 'tripLogId' => $id, 'title' => 't', 'state' => 'armed', 'participants' => array(), 'teams' => array() ) );
};
function rows_of( $ids ) {
	return json_encode( array( 'trips' => array_map( function ( $id ) { return array( 'tripLogId' => $id ); }, $ids ), 'more' => false ) );
}
function track_of( $id ) { return json_encode( array( 'tripLogId' => $id, 'track' => true, 'participants' => array() ) ); }
$list_body = json_encode( array( 'trips' => array( array( 'tripLogId' => 'T1', 'slot' => 'aven-1' ), array( 'tripLogId' => 'T5' ) ), 'more' => false ) );

echo "the list of the trips being followed\n";

reset_site( array( 'tokenone/live' => array( 200, $list_body ) ) );
$r = ask( 'live' );
check( 'an installation with the list route answers it', 200 === $r->status && count( $r->data['trips'] ) === 2, describe( $r ) );
check( 'and the shape is remembered as having it', shape() === 'yes' );

foreach ( array( 502, 503, 500, 429 ) as $code ) {
	reset_site( array( 'tokenone/live' => array( $code, '' ), 'tokenone' => array( 200, $envelope( 'T1' ) ) ) );
	$r = ask( 'live' );
	check( "an upstream $code on the list is passed on as a failure, not answered from the links",
		in_array( $r->status, array( 502, 503 ), true ), describe( $r ) );
	check( "and does not decide for an hour that the installation has no list route",
		shape() !== 'no', var_export( shape(), true ) );
}

reset_site( array( 'tokenone/live' => 'unreachable', 'tokenone' => array( 200, $envelope( 'T1' ) ) ) );
$r = ask( 'live' );
check( 'an installation that cannot be reached is a failure, not an empty list',
	in_array( $r->status, array( 502, 503 ), true ), describe( $r ) );
check( 'and the shape is still undecided', shape() !== 'no' );

reset_site( array( 'tokenone/live' => array( 502, '' ) ) );
ask( 'live' );
$GLOBALS['stub']['answers'] = array( 'tokenone/live' => array( 200, $list_body ) );
$r = ask( 'live' );
check( 'an answered fault is never kept: the next read gets the list', 200 === $r->status && count( $r->data['trips'] ) === 2, describe( $r ) );

echo "an installation without the list route\n";

reset_site( array(
	'tokenone/live' => array( 404, '' ),
	'tokenone'      => array( 200, $envelope( 'T1' ) ),
	'tokentwo'      => array( 200, $envelope( 'T2' ) ),
	'tokenthree'    => array( 404, '' ),
) );
$r = ask( 'live' );
check( 'a 404 on the list route falls back to the links', 200 === $r->status && count( $r->data['trips'] ) === 2, describe( $r ) );
check( 'and the shape is remembered as lacking it', shape() === 'no' );
check( 'a lapsed link is left out rather than failing the others',
	200 === $r->status && array( 'T1', 'T2' ) === array_map( function ( $t ) { return $t['tripLogId']; }, $r->data['trips'] ), describe( $r ) );

echo "the links, when every one of them fails\n";

reset_site( array( 'tokenone' => array( 502, '' ), 'tokentwo' => array( 503, '' ), 'tokenthree' => 'unreachable' ), 'no' );
$r = ask( 'live' );
check( 'every link failing is a failure, not an empty list',
	in_array( $r->status, array( 502, 503 ), true ), describe( $r ) );

reset_site( array( 'tokenone' => array( 404, '' ), 'tokentwo' => array( 404, '' ), 'tokenthree' => array( 404, '' ) ), 'no' );
$r = ask( 'live' );
check( 'every link lapsed is a true empty answer', 200 === $r->status && array() === $r->data['trips'], describe( $r ) );

reset_site( array( 'tokenone' => array( 404, '' ), 'tokentwo' => array( 502, '' ), 'tokenthree' => array( 429, '' ) ), 'no' );
$r = ask( 'live' );
check( 'a lapsed link beside links that failed is still a failure',
	in_array( $r->status, array( 502, 503 ), true ), describe( $r ) );

echo "the links, when one of them fails beside one that answers\n";

// The page takes a list that arrives as the whole list: a party left out of it because its
// link's read was refused is a party the page says is no longer published.
foreach ( array( array( 502, '' ), array( 429, '' ), 'unreachable' ) as $fault ) {
	$named = is_array( $fault ) ? $fault[0] : $fault;
	reset_site( array( 'tokenone' => array( 404, '' ), 'tokentwo' => $fault, 'tokenthree' => array( 200, $envelope( 'T3' ) ) ), 'no' );
	$r = ask( 'live' );
	check( "a link whose read failed ($named) is never left out of a list that says it is whole", 503 === $r->status, describe( $r ) );
}
reset_site( array( 'tokenone' => array( 200, $envelope( 'T1' ) ), 'tokentwo' => array( 200, $envelope( 'T2' ) ), 'tokenthree' => array( 404, '' ) ), 'no' );
$r = ask( 'live' );
check( 'and a link that lapsed still is: the others are the list', 200 === $r->status && 2 === count( $r->data['trips'] ), describe( $r ) );

reset_site( array( 'tokenone' => 'unreachable', 'tokentwo' => 'unreachable', 'tokenthree' => 'unreachable' ), 'no' );
ask( 'live' );
check( 'the first link that cannot be reached ends the round: the others are not waited for', 1 === reads(), reads() . ' reads' );

echo "what the installation's shape is decided on\n";

reset_site( array( 'tokenone/live' => array( 200, $list_body ) ) );
ask( 'live' );
advance( 21 );
$GLOBALS['stub']['answers'] = array();
$r = ask( 'live' );
check( 'an installation known to have the list keeps being asked for it after a round of refusals', shape() === 'yes', var_export( shape(), true ) );
check( 'and that round is every link having lapsed: a true empty list', 200 === $r->status && array() === $r->data['trips'], describe( $r ) );

// The same round of refusals while the links do answer for their own trips. That is what an
// installation without the list looks like — and it is not one: it answered the list a moment
// ago. Deciding "no" here would put the page on the links alone for an hour.
reset_site( array( 'tokenone/live' => array( 200, $list_body ), 'tokenone' => array( 200, $envelope( 'T1' ) ), 'tokentwo' => array( 200, $envelope( 'T2' ) ) ) );
ask( 'live' );
advance( 21 );
$GLOBALS['stub']['answers'] = array( 'tokenone' => array( 200, $envelope( 'T1' ) ), 'tokentwo' => array( 200, $envelope( 'T2' ) ) );
$r = ask( 'live' );
check( 'nor is "has the list" written over when its links, refusing the list, answer for their own trips',
	shape() === 'yes' && 200 === $r->status && 2 === count( $r->data['trips'] ), var_export( shape(), true ) . ' ' . describe( $r ) );
advance( 21 );
$GLOBALS['stub']['answers']['tokenone/live'] = array( 200, $list_body );
$n = reads();
$r = ask( 'live' );
check( 'so the list is asked for again on the next round, and is the answer once it is back',
	200 === $r->status && array( 'T1', 'T5' ) === array_map( function ( $t ) { return $t['tripLogId']; }, $r->data['trips'] ) && 1 === reads() - $n, describe( $r ) . ' ' . ( reads() - $n ) . ' reads' );

reset_site( array() );
$r = ask( 'live' );
check( 'a 404 for everything — a wrong address, every link dead — does not decide the shape', shape() !== 'no', var_export( shape(), true ) );

reset_site( array( 'tokenone/live' => array( 200, $list_body ), 'tokentwo' => array( 200, $envelope( 'T2' ) ) ) );
ask( 'own', 'aven-2' );
$GLOBALS['stub']['answers'] = array();
advance( 5 );
ask( 'live' );
check( 'nor does a link whose trip is only remembered from before it stopped answering', shape() !== 'no', var_export( shape(), true ) );

echo "a first link that has been revoked, beside links that still open the cave\n";

// The links the proxy read, as the token each was asked with, for asserting that the
// per-link path was not taken when the list answered through a later link.
function asked_links() {
	$links = array();
	foreach ( $GLOBALS['stub']['requested'] as $url ) {
		if ( preg_match( '~/api/v1/public/trips/([^/]+)$~', $url, $m ) ) { $links[] = $m[1]; }
	}
	return $links;
}

reset_site( array( 'tokenone/live' => array( 404, '' ), 'tokentwo/live' => array( 200, $list_body ), 'tokenone' => array( 200, $envelope( 'T1' ) ) ) );
$r = ask( 'live' );
check( 'the list is answered through the next link when the first has lapsed', 200 === $r->status && count( $r->data['trips'] ) === 2, describe( $r ) );
check( 'and the shape is remembered as having the list route', shape() === 'yes', var_export( shape(), true ) );
check( 'without reading the links one by one', array() === asked_links(), json_encode( asked_links() ) );

reset_site( array( 'tokenone/live' => array( 404, '' ), 'tokentwo/live' => array( 503, '' ), 'tokenone' => array( 200, $envelope( 'T1' ) ) ) );
$r = ask( 'live' );
check( 'a lapsed first link and a failing second is a failure, not a fallback', 503 === $r->status, describe( $r ) );
check( 'and the shape is still undecided', shape() !== 'no' );

reset_site( array( 'tokenone/live' => array( 404, '' ), 'tokentwo/live' => array( 404, '' ), 'tokenthree/live' => array( 404, '' ), 'tokentwo' => array( 200, $envelope( 'T2' ) ) ) );
$r = ask( 'live' );
check( 'the list refused through every link falls back to the links', 200 === $r->status && count( $r->data['trips'] ) === 1, describe( $r ) );
check( 'and only then is the shape remembered as lacking it', shape() === 'no' );

reset_site( array( 'tokenone/past' => array( 404, '' ), 'tokentwo/past' => array( 200, $list_body ) ) );
$r = ask( 'past' );
check( 'the archive is answered through the next link when the first has lapsed', 200 === $r->status && count( $r->data['trips'] ) === 2, describe( $r ) );

reset_site( array( 'tokenone/past' => array( 404, '' ), 'tokentwo/past' => array( 404, '' ), 'tokenthree/past' => array( 404, '' ) ) );
$r = ask( 'past' );
check( 'the archive refused through every link is a refusal', 404 === $r->status, describe( $r ) );

$uuid = '0f0f0f0f-0f0f-0f0f-0f0f-0f0f0f0f0f0f';
reset_site( array(
	'tokenone/past'           => array( 200, rows_of( array( $uuid ) ) ),
	'tokenone/past/' . $uuid => array( 404, '' ),
	'tokentwo/past/' . $uuid => array( 200, track_of( $uuid ) ),
) );
$r = ask( 'track', 'aven-1', $uuid );
check( 'a track is answered through the next link when the first has lapsed', 200 === $r->status && $uuid === $r->data['tripLogId'], describe( $r ) );

// Every read of the installation so far, as what follows "/trips/" in its address.
function asked_paths() {
	return array_map( function ( $url ) { return preg_replace( '~^.*/trips/~', '', $url ); }, $GLOBALS['stub']['requested'] );
}

echo "a dead link is not paid for on every read\n";

reset_site( array( 'tokentwo/past' => array( 200, $list_body ), 'tokentwo/live' => array( 200, $list_body ) ) );
ask( 'past' );
$n = reads();
ask( 'past' );
check( 'the archive through a dead slot is served from memory the second time', reads() === $n, ( reads() - $n ) . ' reads' );
$GLOBALS['stub']['answers'] = array( 'tokenone/past' => array( 429, '' ), 'tokentwo/past' => array( 200, $list_body ) );
$r = ask( 'past' );
check( "and the dead link's refused read does not hide the answer that is kept", 200 === $r->status, describe( $r ) );
advance( 301 );
$GLOBALS['stub']['answers'] = array( 'tokentwo/past' => array( 200, $list_body ), 'tokentwo/live' => array( 200, $list_body ) );
$n = reads();
$r = ask( 'past' );
check( 'once the kept copy has lapsed, the link that answered last is the one asked: one read, not two',
	200 === $r->status && 1 === reads() - $n && false !== strpos( end( $GLOBALS['stub']['requested'] ), 'tokentwo' ), ( reads() - $n ) . ' reads' );
$n = reads();
$r = ask( 'live' );
check( 'the followed list is asked of the named link itself first, and comes through the link that answered last when that one refuses',
	200 === $r->status && array( 'tokenone/live', 'tokentwo/live' ) === array_slice( asked_paths(), $n ), json_encode( array_slice( asked_paths(), $n ) ) );
advance( 21 );
$n = reads();
ask( 'live' );
check( 'after which the dead link is not asked on every poll: one read, of the link standing in for it',
	array( 'tokentwo/live' ) === array_slice( asked_paths(), $n ), json_encode( array_slice( asked_paths(), $n ) ) );
$GLOBALS['stub']['answers'] = array( 'tokenthree/past' => array( 200, $list_body ) );
advance( 301 );
$r = ask( 'past' );
check( 'a remembered link that dies in its turn is walked past to one that answers', 200 === $r->status, describe( $r ) );

reset_site( array() );
ask( 'own', 'aven-2' );
$n = reads();
$r = ask( 'own', 'aven-2' );
check( "a dead link's own trip is refused from memory the second time", 404 === $r->status && reads() === $n, ( reads() - $n ) . ' reads' );
advance( 21 );
ask( 'own', 'aven-2' );
check( 'and asked again once that short memory has lapsed', 1 === reads() - $n, ( reads() - $n ) . ' reads' );

// The page's own rule, as cave-trips.js follows it: each reader asks the followed list and
// the archive through the slot that answered them last, and moves to the next slot only on a
// 404. What is returned is how many reads reached the installation in the busiest minute.
function busiest_minute( $readers, $period, $minutes, $alive ) {
	$slots = array( 'aven-1' => 'tok1', 'aven-2' => 'tok2', 'aven-3' => 'tok3', 'aven-4' => 'tok4', 'aven-5' => 'tok5' );
	$page  = array( 'aven-1', 'aven-2', 'aven-3', 'aven-4' );
	reset_site( array(), false, $slots );
	$GLOBALS['stub']['upstream'] = function ( $url ) use ( $alive ) {
		preg_match( '~/trips/(tok\d)~', $url, $m );
		return in_array( $m[1], $alive, true ) ? array( 200, '{"trips":[],"more":false}' ) : array( 404, '' );
	};
	$events = array();
	for ( $i = 0; $i < $readers; $i++ ) {
		for ( $t = $period * $i / $readers; $t < $minutes * 60; $t += $period ) { $events[] = array( $t, $i ); }
	}
	usort( $events, function ( $a, $b ) { return $a[0] <=> $b[0]; } );
	$began      = $GLOBALS['stub']['now'];
	$remembered = array_fill( 0, $readers, 0 );
	foreach ( $events as $event ) {
		advance( $began + $event[0] - $GLOBALS['stub']['now'] );
		foreach ( array( 'live', 'past' ) as $which ) {
			for ( $k = 0; $k < count( $page ); $k++ ) {
				$index  = ( $remembered[ $event[1] ] + $k ) % count( $page );
				$status = ask( $which, $page[ $index ] )->status;
				if ( 200 === $status ) { $remembered[ $event[1] ] = $index; }
				if ( 404 !== $status ) { break; }
			}
		}
	}
	$per_minute = array_fill( 0, $minutes, 0 );
	foreach ( $GLOBALS['stub']['times'] as $at ) { $per_minute[ min( $minutes - 1, (int) floor( ( $at - $began ) / 60 ) ) ]++; }
	return max( $per_minute );
}
$healthy = busiest_minute( 30, 30, 5, array( 'tok1', 'tok2', 'tok3', 'tok4', 'tok5' ) );
$dead    = busiest_minute( 30, 30, 5, array( 'tok2', 'tok3', 'tok4', 'tok5' ) );
check( "thirty readers polling through a dead first link cost the installation under 10 reads a minute ($dead in the busiest; $healthy with every link alive)", $dead < 10 );
$few  = busiest_minute( 30, 300, 10, array() );
$many = busiest_minute( 300, 300, 10, array() );
check( "every link dead: what reaches the installation is bounded, 45 reads a minute at most ($few in the busiest, thirty readers)", $few <= 45 );
check( "and does not grow with the number of readers ($many in the busiest, three hundred readers)", $many <= 45 );

echo "the followed list, which the installation gives each link for its own survey\n";

// Two links of one cave on two surveys. The installation places a party against the survey of
// the link that asks and against no other, so the same trip comes back placed through one
// link and marked as recorded elsewhere through the other. Invented; the shape is the
// installation's.
$seen_through = function ( $placed ) {
	return array( 200, json_encode( array( 'trips' => array( array( 'tripLogId' => 'T2', 'participants' => array(
		array( 'ordinal' => 1, 'stationName' => $placed ? 's.7' : null, 'positionOnOtherModel' => ! $placed ),
	) ) ), 'more' => false ) ) );
};
// The link a group is remembered to begin with, or false; null in a copy of the proxy from
// before groups remembered one.
function remembered_lead( $group ) {
	return function_exists( 'silex_trips_memo_key' ) ? get_transient( silex_trips_memo_key( 'lead', $group ) ) : null;
}
function party_is( $r ) {
	if ( 200 !== $r->status || ! isset( $r->data['trips'][0]['participants'][0] ) ) { return (string) $r->status; }
	return $r->data['trips'][0]['participants'][0]['positionOnOtherModel'] ? 'elsewhere' : 'placed';
}
const TWO_SURVEYS = array( 'cave-1' => 'tokold', 'cave-2' => 'toknew' );
$both_alive = array(
	'tokold/live' => $seen_through( false ), 'toknew/live' => $seen_through( true ),
	'tokold/past' => array( 200, rows_of( array() ) ), 'toknew/past' => array( 200, rows_of( array() ) ),
);

reset_site( $both_alive, false, TWO_SURVEYS );
$a = ask( 'live', 'cave-1' );
$b = ask( 'live', 'cave-2' );
check( 'each slot is given the list as its own link is given it',
	'elsewhere' === party_is( $a ) && 'placed' === party_is( $b ), party_is( $a ) . ' / ' . party_is( $b ) );
check( 'each through its own link', array( 'tokold/live', 'toknew/live' ) === asked_paths(), json_encode( asked_paths() ) );
check( 'and neither is written down as the link to begin with: two pages naming two links would rewrite that at each other on every read',
	false === remembered_lead( 'cave' ), var_export( remembered_lead( 'cave' ), true ) );
$n = reads();
$a = ask( 'live', 'cave-1' );
$b = ask( 'live', 'cave-2' );
check( 'and the two are kept apart: asked again, each gets its own without a read',
	'elsewhere' === party_is( $a ) && 'placed' === party_is( $b ) && reads() === $n, party_is( $a ) . ' / ' . party_is( $b ) . ', ' . ( reads() - $n ) . ' reads' );
$seen = array();
for ( $i = 0; $i < 6; $i++ ) {
	advance( 30 );
	$n      = reads();
	$seen[] = party_is( ask( 'live', 'cave-2' ) ) . ' ' . implode( ',', array_slice( asked_paths(), $n ) );
}
check( 'poll after poll a slot is asked through its own link, whichever link was asked before it',
	array( 'placed toknew/live' ) === array_values( array_unique( $seen ) ), json_encode( $seen ) );

reset_site( $both_alive, false, TWO_SURVEYS );
ask( 'past', 'cave-1' );
$b = ask( 'live', 'cave-2' );
check( "the archive having been read through another slot does not change whose list a slot is given",
	'placed' === party_is( $b ) && 'toknew/live' === asked_paths()[ reads() - 1 ], party_is( $b ) . ' ' . json_encode( asked_paths() ) );

reset_site( $both_alive, false, TWO_SURVEYS );
ask( 'live', 'cave-1' );
advance( 3601 );
$b = ask( 'live', 'cave-2' );
advance( 30 );
$a = ask( 'live', 'cave-1' );
check( 'nor does an hour going by, whichever slot is then asked first',
	'placed' === party_is( $b ) && 'elsewhere' === party_is( $a ), party_is( $b ) . ' / ' . party_is( $a ) );

// The named link refused: revoked, or lapsed. Another link of the cave answers in its place —
// placed on its own survey, but every trip of the cave being followed is in it.
reset_site( array( 'toknew/live' => $seen_through( true ) ), false, TWO_SURVEYS );
$a = ask( 'live', 'cave-1' );
check( 'a slot whose own link refuses the list is given it through another link of the cave, not left without',
	'placed' === party_is( $a ) && array( 'tokold/live', 'toknew/live' ) === asked_paths(), party_is( $a ) . ' ' . json_encode( asked_paths() ) );
check( 'and the link that stood in is the one remembered to begin with', 'cave-2' === remembered_lead( 'cave' ), var_export( remembered_lead( 'cave' ), true ) );
$n = reads();
$a = ask( 'live', 'cave-1' );
check( "from the copy kept under the link standing in, the second time", 'placed' === party_is( $a ) && reads() === $n, ( reads() - $n ) . ' reads' );
$GLOBALS['stub']['answers']['tokold/live'] = array( 429, '' );
advance( 21 );
$n = reads();
$a = ask( 'live', 'cave-1' );
check( 'and twenty seconds on the link that refused is not asked again — nor can its limiter\'s refusal stand in the way: one read, of the other',
	'placed' === party_is( $a ) && array( 'toknew/live' ) === array_slice( asked_paths(), $n ), party_is( $a ) . ' ' . json_encode( array_slice( asked_paths(), $n ) ) );
$GLOBALS['stub']['answers']['tokold/live'] = array( 404, '' );
$n = reads();
for ( $i = 0; $i < 116; $i++ ) { advance( 30 ); ask( 'live', 'cave-1' ); }
$of_dead = count( array_filter( array_slice( asked_paths(), $n ), function ( $path ) { return 'tokold/live' === $path; } ) );
check( 'for the rest of the hour a dead link the page names costs the installation no read at all', 0 === $of_dead, $of_dead . ' reads of it in fifty-eight minutes' );
advance( 120 );
$n = reads();
ask( 'live', 'cave-1' );
advance( 30 );
ask( 'live', 'cave-1' );
$of_dead = count( array_filter( array_slice( asked_paths(), $n ), function ( $path ) { return 'tokold/live' === $path; } ) );
check( 'and one when the hour is over, to find out whether it still refuses', 1 === $of_dead, $of_dead . ' reads of it' );

reset_site( array( 'tokold/live' => array( 503, '' ), 'toknew/live' => $seen_through( true ) ), false, TWO_SURVEYS );
ask( 'live', 'cave-2' );
$a = ask( 'live', 'cave-1' );
check( "a link whose read failed is not answered with another link's list: a failure says nothing of the link, and is passed on",
	503 === $a->status, describe( $a ) );

// What is remembered of a refusing link is the order to ask in, and nothing else.
reset_site( array( 'toknew/live' => $seen_through( true ) ), false, TWO_SURVEYS );
ask( 'live', 'cave-1' );
$GLOBALS['stub']['answers'] = array( 'tokold/live' => $seen_through( false ) );
advance( 21 );
$a = ask( 'live', 'cave-1' );
check( 'a link remembered as refusing is still asked when no other answers, and believed when it does',
	'elsewhere' === party_is( $a ), describe( $a ) );
advance( 21 );
$n = reads();
ask( 'live', 'cave-1' );
check( 'and is asked first again from then on', array( 'tokold/live' ) === array_slice( asked_paths(), $n ), json_encode( array_slice( asked_paths(), $n ) ) );

// Links that refused together — the cave switched to protected for an afternoon — and answer
// together again. The first one found answering must not go on standing in for the others.
reset_site( array(), false, TWO_SURVEYS );
ask( 'live', 'cave-1' );
$GLOBALS['stub']['answers'] = $both_alive;
advance( 21 );
$a = ask( 'live', 'cave-1' );
$b = ask( 'live', 'cave-2' );
check( 'links that refused together and answer again are each asked for their own slot again, at once',
	'elsewhere' === party_is( $a ) && 'placed' === party_is( $b ), party_is( $a ) . ' / ' . party_is( $b ) );

reset_site( array() );
ask( 'live' );
$lists = function ( $from ) {
	return array_values( array_filter( array_slice( asked_paths(), $from ), function ( $path ) { return '/live' === substr( $path, -5 ); } ) );
};
check( 'when every link refuses the list, each has been asked for it, once', array( 'tokenone/live', 'tokentwo/live', 'tokenthree/live' ) === $lists( 0 ), json_encode( $lists( 0 ) ) );
$n = reads();
ask( 'live' );
ask( 'live', 'aven-2' );
check( 'and none is asked again for a short while, whichever slot is named', array() === $lists( $n ), json_encode( $lists( $n ) ) );
advance( 21 );
$n = reads();
ask( 'live' );
check( 'after it each is asked once more, remembered as refusing or not: that memory never stops a link being asked',
	3 === count( $lists( $n ) ) && 3 === count( array_unique( $lists( $n ) ) ), json_encode( $lists( $n ) ) );
$GLOBALS['stub']['answers'] = array( 'tokenthree/live' => array( 200, $list_body ) );
advance( 21 );
$r = ask( 'live' );
check( 'so a list that comes back, through any link, is on the page within that short while and not within the hour',
	200 === $r->status && 2 === count( $r->data['trips'] ) && shape() === 'yes', describe( $r ) );

reset_site( array(), false, array( 'cave-1' => 'tokshared', 'cave-2' => 'tokshared', 'cave-3' => 'tokthird' ) );
ask( 'live', 'cave-1' );
check( 'a link held under two names is one link, asked once in a round', array( 'tokshared/live', 'tokthird/live' ) === $lists( 0 ), json_encode( $lists( 0 ) ) );

echo "links of more than one cave\n";

// Two groups: "a" whose only link the installation refuses, and "b" of another cave, alive.
$id_b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
$two_caves = array(
	'tokenb/live'          => array( 200, rows_of( array( 'LB' ) ) ),
	'tokenb/past/' . $id_b => array( 200, track_of( $id_b ) ),
	'tokenb/past'          => array( 200, rows_of( array( $id_b ) ) ),
	'tokenb'               => array( 200, $envelope( 'LB' ) ),
);
function asked_of_b() {
	return count( array_filter( $GLOBALS['stub']['requested'], function ( $url ) { return false !== strpos( $url, 'tokenb' ); } ) );
}
reset_site( $two_caves, false, array( 'a-1' => 'tokena', 'b-1' => 'tokenb' ) );
$r = ask( 'past', 'a-1' );
check( "a cave whose link is refused is not answered with another cave's archive", 404 === $r->status, describe( $r ) );
$r = ask( 'track', 'a-1', $id_b );
check( "nor with another cave's track", 404 === $r->status, describe( $r ) );
$r = ask( 'live', 'a-1' );
check( "nor with another cave's party", 200 !== $r->status || array() === $r->data['trips'], describe( $r ) );
check( "and the other cave's link was never asked on its behalf", 0 === asked_of_b(), asked_of_b() . ' reads of it' );
check( 'what was learnt of one group is not remembered of the other', false === shape( 'b' ), var_export( shape( 'b' ), true ) );
$r = ask( 'past', 'b-1' );
check( 'the other cave still answers through its own slot', 200 === $r->status && $id_b === $r->data['trips'][0]['tripLogId'], describe( $r ) );

reset_site( array( 'tokena' => array( 200, $envelope( 'LA' ) ), 'tokenb' => array( 200, $envelope( 'LB' ) ) ), false, array( 'a-1' => 'tokena', 'b-1' => 'tokenb' ) );
$r = ask( 'live', 'a-1' );
check( "a list assembled from the links holds the named group's links only",
	200 === $r->status && array( 'a-1' ) === array_map( function ( $t ) { return $t['slot']; }, $r->data['trips'] ), describe( $r ) );

reset_site( array( 'tokentwo/past' => array( 200, $list_body ) ), false, array( 'aven-1' => 'tokenone', 'aven-2' => 'tokentwo', 'aven' => 'tokenbare', 'other' => 'tokenother' ) );
$r = ask( 'past', 'aven' );
check( 'a name with no number is of the group of that name', 200 === $r->status, describe( $r ) );
$r = ask( 'past', 'other' );
check( 'and a name of its own is a group of its own', 404 === $r->status, describe( $r ) );

// Two links of one cave named without the number are two groups of one. Nothing answers for
// the first when it dies; what the page is told then is true of that link, and the screen is
// where the administrator is told what the names mean (see the screen's cases below).
reset_site( array( 'tokb/live' => array( 200, $list_body ), 'tokb/past' => array( 200, $list_body ) ), false, array( 's1' => 'toka', 's2' => 'tokb' ) );
$r = ask( 'live', 's1' );
check( 'a dead link that stands alone in its group has an empty list of its own, which no browser may keep',
	200 === $r->status && array() === $r->data['trips'] && 0 === max_age( $r ), describe( $r ) );
check( 'and no archive', 404 === ask( 'past', 's1' )->status );
check( 'while the link beside it answers through its own name', 2 === count( ask( 'live', 's2' )->data['trips'] ) );

echo "a track is asked for only when the archive lists the trip\n";

$listed  = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
$crossed = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
function invented( $n ) { return sprintf( '%08x-0000-4000-8000-%012x', $n, $n ); }
function track_reads() {
	return count( array_filter( $GLOBALS['stub']['requested'], function ( $url ) { return (bool) preg_match( '~/past/[0-9a-f-]{36}$~i', $url ); } ) );
}
$archive_site = function () use ( $listed ) {
	reset_site( array(
		'tokenone/past'             => array( 200, rows_of( array( $listed ) ) ),
		'tokenone/past/' . $listed => array( 200, track_of( $listed ) ),
	) );
};

$archive_site();
ask( 'past' );
$n = reads();
$r = ask( 'track', 'aven-1', invented( 1 ) );
check( 'an identifier the archive does not list is refused here', 404 === $r->status && 'silex_trips_refused' === code_of( $r ), describe( $r ) );
check( 'without the installation being asked', reads() === $n, ( reads() - $n ) . ' reads' );
ask( 'track', 'aven-1', invented( 1 ) );
check( 'nor when it is asked for again', reads() === $n, ( reads() - $n ) . ' reads' );
$n = reads();
$r = ask( 'track', 'aven-1', $listed );
check( 'a listed trip costs one read', 200 === $r->status && 1 === reads() - $n, ( reads() - $n ) . ' reads' );
$n = reads();
ask( 'track', 'aven-1', $listed );
check( 'and none when asked for again', reads() === $n, ( reads() - $n ) . ' reads' );
$held = count( $GLOBALS['stub']['transients'] );
for ( $i = 10; $i < 15; $i++ ) { ask( 'track', 'aven-1', invented( $i ) ); }
check( 'what this server keeps does not grow with the identifiers it is asked for: no refusal is remembered under one',
	count( $GLOBALS['stub']['transients'] ) === $held, ( count( $GLOBALS['stub']['transients'] ) - $held ) . ' more things kept' );

$archive_site();
ask( 'past' );
advance( 100 );
$n = reads();
for ( $i = 0; $i < 24; $i++ ) { ask( 'track', 'aven-1', invented( $i ) ); advance( 0.5 ); }
check( 'twenty-four invented identifiers in twelve seconds cost one read between them', reads() - $n <= 1, ( reads() - $n ) . ' reads' );
check( 'and that read is of the archive, never of a track', 0 === track_reads(), track_reads() . ' track reads' );
advance( 21 );
$n = reads();
ask( 'track', 'aven-1', invented( 99 ) );
advance( 1 );
ask( 'track', 'aven-1', invented( 98 ) );
check( 'twenty seconds on, the archive may be read again: once more, for however many', 1 === reads() - $n, ( reads() - $n ) . ' reads' );

// A trip that became history after the archive was read: the list kept here does not have it,
// the installation does. Refusing it would be telling the page the trip does not exist.
$archive_site();
ask( 'past' );
advance( 100 );
$GLOBALS['stub']['answers'] = array(
	'tokenone/past'              => array( 200, rows_of( array( $listed, $crossed ) ) ),
	'tokenone/past/' . $crossed => array( 200, track_of( $crossed ) ),
);
$r = ask( 'track', 'aven-1', $crossed );
check( 'a trip that has just become history is not refused on an old list', 200 === $r->status && $crossed === $r->data['tripLogId'], describe( $r ) );
$r = ask( 'past' );
check( 'and the archive read for it is the one kept from then on',
	200 === $r->status && 2 === count( $r->data['trips'] ), describe( $r ) );

$archive_site();
ask( 'past' );
advance( 100 );
$GLOBALS['stub']['answers'] = array( 'tokenone/past' => array( 503, '' ), 'tokenone/past/' . $listed => array( 200, track_of( $listed ) ) );
$r = ask( 'track', 'aven-1', $crossed );
check( 'when the archive cannot be read again, that is a failure and not "no such trip"', 503 === $r->status, describe( $r ) );
$n = reads();
$r = ask( 'track', 'aven-1', invented( 7 ) );
check( 'and stays one, without asking, until the archive may be read again', 503 === $r->status && reads() === $n, describe( $r ) . ' ' . ( reads() - $n ) . ' reads' );
$r = ask( 'track', 'aven-1', $listed );
check( 'while a trip the old list does carry is still answered', 200 === $r->status, describe( $r ) );

// A trip that left the archive after the list was read: listed here, refused there.
$archive_site();
ask( 'track', 'aven-1', $listed );
advance( 61 );
$GLOBALS['stub']['answers'] = array( 'tokenone/past' => array( 200, rows_of( array() ) ) );
$n = reads();
$r = ask( 'track', 'aven-1', $listed );
check( 'a listed trip the installation now refuses is refused, having been asked for through each link', 404 === $r->status && 3 === reads() - $n, describe( $r ) . ' ' . ( reads() - $n ) . ' reads' );
$n = reads();
for ( $i = 0; $i < 5; $i++ ) { ask( 'track', 'aven-1', $listed ); }
check( 'after which the archive is read anew, once, and the trip is refused here like any other', 1 === reads() - $n && 0 === track_reads() - 4, ( reads() - $n ) . ' reads' );

// The same, while somebody keeps the archive's reading-again busy with invented identifiers.
$archive_site();
ask( 'track', 'aven-1', $listed );
advance( 61 );
$GLOBALS['stub']['answers'] = array( 'tokenone/past' => array( 200, rows_of( array( $listed ) ) ) );
ask( 'track', 'aven-1', invented( 5 ) );
$GLOBALS['stub']['answers'] = array( 'tokenone/past' => array( 200, rows_of( array() ) ) );
advance( 1 );
$n = reads();
for ( $i = 0; $i < 5; $i++ ) { ask( 'track', 'aven-1', $listed ); ask( 'track', 'aven-1', invented( 10 + $i ) ); }
check( 'a list known to be wrong cannot be kept in service by asking for invented identifiers beside it', reads() - $n <= 4, ( reads() - $n ) . ' reads' );

// The archive is kept here and the installation stops giving it — the cave has been switched
// to protected, the last link revoked. Reading it again for an identifier is where this
// server finds out, and what it still keeps must stop being served then, not five minutes on.
$archive_site();
ask( 'past' );
advance( 100 );
$GLOBALS['stub']['answers'] = array();
$r = ask( 'track', 'aven-1', invented( 1 ) );
check( 'an archive every link refuses on being read again gives no track', 404 === $r->status, describe( $r ) );
$r = ask( 'past' );
check( 'and the copy kept from before stops being served at once, though it had minutes left', 404 === $r->status, describe( $r ) );

reset_site( array() );
$r = ask( 'track', 'aven-1', $listed );
check( 'a cave whose archive every link refuses has no track to give', 404 === $r->status, describe( $r ) );
$n = reads();
ask( 'track', 'aven-1', invented( 3 ) );
check( 'and saying so again costs nothing', reads() === $n, ( reads() - $n ) . ' reads' );

$r = ask( 'track', 'nosuch-1', $listed );
check( 'a slot the site does not hold is still its own refusal', 404 === $r->status && 'silex_trips_unknown_slot' === code_of( $r ), describe( $r ) );

echo "one trip, however its identifier is spelt\n";

$archive_site();
$spelt = array( ask( 'track', 'aven-1', $listed ), ask( 'track', 'aven-1', strtoupper( $listed ) ), ask( 'track', 'aven-1', ucfirst( $listed ) ) );
check( 'three spellings of one identifier are each answered with the track',
	array( 200, 200, 200 ) === array_map( function ( $r ) { return $r->status; }, $spelt )
	&& array( $listed ) === array_values( array_unique( array_map( function ( $r ) { return isset( $r->data['tripLogId'] ) ? $r->data['tripLogId'] : null; }, $spelt ) ) ),
	json_encode( array_map( function ( $r ) { return $r->status; }, $spelt ) ) );
check( 'three spellings of one identifier are one read of the track', 1 === track_reads(), track_reads() . ' track reads' );
check( 'asked for in lower case', 1 === count( array_filter( $GLOBALS['stub']['requested'], function ( $url ) use ( $listed ) { return substr( $url, -36 ) === $listed; } ) ), json_encode( $GLOBALS['stub']['requested'] ) );
check( 'and one kept copy of it',
	1 === count( array_filter( kept_answers(), function ( $v ) { return is_array( $v ) && ! empty( $v['track'] ); } ) ) );
check( 'the route accepts the spellings it is asked with',
	1 === preg_match( '@^' . $GLOBALS['patterns']['track'] . '$@i', '/trips/aven-1/past/' . strtoupper( $listed ) ) );
reset_site( array( 'tokenone/past' => array( 200, rows_of( array( strtoupper( $listed ) ) ) ), 'tokenone/past/' . $listed => array( 200, track_of( $listed ) ) ) );
$spelt = array( ask( 'track', 'aven-1', $listed ), ask( 'track', 'aven-1', strtoupper( $listed ) ) );
check( 'and an archive that spells the identifier in capitals lists the same trip',
	array( 200, 200 ) === array_map( function ( $r ) { return $r->status; }, $spelt ) && 1 === track_reads(),
	json_encode( array_map( function ( $r ) { return $r->status; }, $spelt ) ) . ', ' . track_reads() . ' track reads' );

echo "a trip crossing from the followed list into the archive\n";

// The installation's two lists share a trip: at one instant it leaves the followed list and
// is history. The archive kept here was read before that instant.
$crossing = function ( $followed, $archived ) {
	return array( 'tokenone/live' => array( 200, rows_of( $followed ) ), 'tokenone/past' => array( 200, rows_of( $archived ) ) );
};
reset_site( $crossing( array( 'T1', 'T5' ), array() ) );
ask( 'live' );
ask( 'past' );
advance( 21 );
$GLOBALS['stub']['answers'] = $crossing( array( 'T5' ), array( 'T1' ) );
$r = ask( 'live' );
check( 'the followed list no longer carries the trip', 200 === $r->status && 1 === count( $r->data['trips'] ), describe( $r ) );
$r = ask( 'past' );
check( 'and the archive read next is not the one kept from before: it lists the trip',
	200 === $r->status && 1 === count( $r->data['trips'] ) && 'T1' === $r->data['trips'][0]['tripLogId'], describe( $r ) );
$n = reads();
ask( 'past' );
check( 'which is then kept as any archive is', reads() === $n, ( reads() - $n ) . ' reads' );

// The page sends both questions together, and the archive may be answered first — from the
// copy kept before the crossing. What the page then has is a trip in neither list, and what it
// does is ask for the trip's track: that must be the installation's answer, not an old list's.
reset_site( $crossing( array( $crossed, 'T5' ), array() ) );
ask( 'live' );
ask( 'past' );
advance( 21 );
$GLOBALS['stub']['answers'] = $crossing( array( 'T5' ), array( $crossed ) ) + array( 'tokenone/past/' . $crossed => array( 200, track_of( $crossed ) ) );
$before = ask( 'past' );
ask( 'live' );
$r = ask( 'track', 'aven-1', $crossed );
check( 'asked for the other way round — archive first, from the old copy — the trip is in neither list for that one read',
	200 === $before->status && array() === $before->data['trips'], describe( $before ) );
check( 'and its track is answered at once, which is how the page learns it is history', 200 === $r->status && $crossed === $r->data['tripLogId'], describe( $r ) );

// A read of the archive that is on its way while the trip crosses. The installation answered
// it from before the crossing; while that answer travels, another request reads the followed
// list afresh, finds the trip gone and lets the archive go. The old answer then arrives and
// is stored. It must not be what the next reader is given: a kept answer is as old as the
// moment its read began, not the moment it was put away.
reset_site( array() );
$on_its_way = array( 'crossed' => false, 'travelling' => false );
$GLOBALS['stub']['upstream'] = function ( $url ) use ( &$on_its_way ) {
	if ( '/live' === substr( $url, -5 ) ) {
		return array( 200, rows_of( $on_its_way['crossed'] ? array( 'T5' ) : array( 'T1', 'T5' ) ) );
	}
	if ( '/past' !== substr( $url, -5 ) ) {
		return array( 404, '' );
	}
	if ( ! $on_its_way['travelling'] ) {
		return array( 200, rows_of( $on_its_way['crossed'] ? array( 'T1' ) : array() ) );
	}
	$on_its_way = array( 'crossed' => true, 'travelling' => false );
	usleep( 2000 );
	ask( 'live' );
	usleep( 2000 );
	return array( 200, rows_of( array() ) );
};
ask( 'live' );
ask( 'past' );
advance( 301 );
$on_its_way['travelling'] = true;
$r = ask( 'past' );
check( 'a read of the archive that was on its way across the crossing answers its own reader with the list from before',
	200 === $r->status && array() === $r->data['trips'], describe( $r ) );
$n = reads();
$r = ask( 'past' );
check( 'and is not what the next reader is given: the archive is read anew, and lists the trip',
	200 === $r->status && 1 === count( $r->data['trips'] ) && 'T1' === $r->data['trips'][0]['tripLogId'] && 1 === reads() - $n, describe( $r ) . ' ' . ( reads() - $n ) . ' reads' );

// Nothing remembered of the followed list from before — an hour without a reader. What left
// it meanwhile is not known, so the archive kept here cannot be trusted to have it.
reset_site( $crossing( array( 'T1', 'T5' ), array() ) );
ask( 'live' );
advance( 3601 );
ask( 'past' );
$GLOBALS['stub']['answers'] = $crossing( array( 'T5' ), array( 'T1' ) );
ask( 'live' );
$r = ask( 'past' );
check( 'a followed list read with none remembered before it lets the kept archive go as well',
	200 === $r->status && 1 === count( $r->data['trips'] ) && 'T1' === $r->data['trips'][0]['tripLogId'], describe( $r ) );

reset_site( $crossing( array( 'T1', 'T5' ), array() ) );
ask( 'live' );
ask( 'past' );
advance( 21 );
$n = reads();
ask( 'live' );
ask( 'past' );
check( 'a followed list that lost nobody leaves the kept archive alone', 1 === reads() - $n, ( reads() - $n ) . ' reads' );
advance( 21 );
$GLOBALS['stub']['answers'] = $crossing( array( 'T1', 'T5', 'T9' ), array() );
$n = reads();
ask( 'live' );
ask( 'past' );
check( 'and so does one that gained a trip', 1 === reads() - $n, ( reads() - $n ) . ' reads' );

reset_site( array( 'tokenone' => array( 200, $envelope( 'T1' ) ), 'tokentwo' => array( 200, $envelope( 'T2' ) ), 'tokentwo/past' => array( 200, rows_of( array() ) ) ), 'no' );
ask( 'live' );
ask( 'past' );
advance( 21 );
$GLOBALS['stub']['answers'] = array( 'tokentwo' => array( 200, $envelope( 'T2' ) ), 'tokentwo/past' => array( 200, rows_of( array( 'T1' ) ) ) );
ask( 'live' );
$r = ask( 'past' );
check( 'a list assembled from the links forgets the archive the same way when a link stops answering',
	200 === $r->status && 1 === count( $r->data['trips'] ), describe( $r ) );

echo "an installation that cannot be reached\n";

$statuses = function ( $responses ) { return array_map( function ( $r ) { return $r->status . ' ' . code_of( $r ); }, $responses ); };
$nowhere  = array( 'tokenone/live' => 'unreachable', 'tokenone/past' => 'unreachable', 'tokenone' => 'unreachable', 'tokentwo/live' => 'unreachable' );

reset_site( $nowhere );
$r = ask( 'live' );
check( 'is a 503 of the proxy\'s own, by its code', 503 === $r->status && 'silex_trips_unreachable' === code_of( $r ), describe( $r ) );
check( 'after a wait of five to eight seconds, not twelve',
	isset( $GLOBALS['stub']['sent'][0]['timeout'] ) && $GLOBALS['stub']['sent'][0]['timeout'] >= 5 && $GLOBALS['stub']['sent'][0]['timeout'] <= 8,
	json_encode( $GLOBALS['stub']['sent'][0] ) );
$n = reads();
$r = ask( 'past' );
check( 'one read without an answer is not yet the installation being down: another read after it is made',
	503 === $r->status && 1 === reads() - $n, describe( $r ) . ' ' . ( reads() - $n ) . ' reads' );
$n = reads();
$again = array( ask( 'live' ), ask( 'past' ), ask( 'own' ), ask( 'live', 'aven-2' ) );
check( 'two different reads in a row are: it is not asked again for a while, whatever is wanted of it', reads() === $n, ( reads() - $n ) . ' reads' );
check( 'each of those being the same 503',
	array( '503 silex_trips_unreachable' ) === array_values( array_unique( $statuses( $again ) ) ), json_encode( $statuses( $again ) ) );
advance( 21 );
$n = reads();
$again = array( ask( 'live' ), ask( 'past' ), ask( 'own' ) );
check( 'twenty seconds on it is asked once, and that one read without an answer is enough: one wait every twenty seconds for as long as it is down',
	1 === reads() - $n && array( '503 silex_trips_unreachable' ) === array_values( array_unique( $statuses( $again ) ) ), ( reads() - $n ) . ' reads ' . json_encode( $statuses( $again ) ) );
advance( 21 );
$GLOBALS['stub']['answers'] = array( 'tokenone/live' => array( 200, $list_body ) );
$r = ask( 'live' );
check( 'when it answers again, it is asked and answers', 200 === $r->status, describe( $r ) );

// One read without an answer, then an answer, then another read without one: neither is the
// second in a row, so what is asked after them is still asked.
reset_site( array( 'tokenone' => 'unreachable', 'tokentwo' => array( 200, $envelope( 'T2' ) ), 'tokenthree' => 'unreachable', 'tokenone/past' => array( 200, $list_body ) ) );
ask( 'own', 'aven-1' );
ask( 'own', 'aven-2' );
ask( 'own', 'aven-3' );
$n = reads();
$r = ask( 'past' );
check( 'an answer takes what went before it off the record: a read without one is again only the first',
	200 === $r->status && 1 === reads() - $n, describe( $r ) . ' ' . ( reads() - $n ) . ' reads' );

// One read that is slow by itself while the installation is well: the first after it restarts.
reset_site( array( 'tokenone/live' => 'unreachable', 'tokenone/past' => array( 200, $list_body ), 'tokenone' => array( 200, $envelope( 'T1' ) ) ) );
$r = ask( 'live' );
$GLOBALS['stub']['answers']['tokenone/live'] = array( 200, $list_body );
$again = array( ask( 'own' ), ask( 'past' ), ask( 'live' ) );
check( 'a read that got no answer by itself takes nothing else off the page: the link\'s own trip, the archive and the list asked again all answer',
	503 === $r->status && array( '200 ', '200 ', '200 ' ) === $statuses( $again ), json_encode( $statuses( $again ) ) );

// One read that gets no answer every time while the rest is well — an archive the
// installation cannot put together. It is waited for once per short while, however many ask
// for it, and nothing else is stopped by it.
reset_site( array( 'tokenone/past' => 'unreachable', 'tokenone/live' => array( 200, $list_body ), 'tokenone' => array( 200, $envelope( 'T1' ) ) ) );
$first = array( ask( 'past' ), ask( 'live' ), ask( 'past' ), ask( 'own' ) );
$n     = reads();
$again = array( ask( 'past' ), ask( 'past' ) );
check( 'a read that twice running got no answer is not made again for a while',
	array( '503 silex_trips_unreachable', '200 ', '503 silex_trips_unreachable', '200 ' ) === $statuses( $first )
	&& reads() === $n && array( '503 silex_trips_unreachable' ) === array_values( array_unique( $statuses( $again ) ) ),
	json_encode( $statuses( $first ) ) . ' then ' . ( reads() - $n ) . ' reads ' . json_encode( $statuses( $again ) ) );
$again = array( ask( 'live' ), ask( 'own' ) );
check( 'and stops nothing else being answered', array( '200 ', '200 ' ) === $statuses( $again ), json_encode( $statuses( $again ) ) );
advance( 21 );
$n     = reads();
$again = array( ask( 'past' ), ask( 'past' ), ask( 'live' ) );
check( 'twenty seconds on it is tried once and no more: a read that never answers is one wait per twenty seconds, and the list beside it is still read',
	array( '503 silex_trips_unreachable', '503 silex_trips_unreachable', '200 ' ) === $statuses( $again ) && array( 'tokenone/past', 'tokenone/live' ) === array_slice( asked_paths(), $n ),
	json_encode( $statuses( $again ) ) . ' ' . json_encode( array_slice( asked_paths(), $n ) ) );

// A read that got no answer once and was answered when made again: the record of it is gone,
// and its next silence is a first one.
reset_site( array( 'tokenone/live' => 'unreachable' ) );
ask( 'live' );
$GLOBALS['stub']['answers']['tokenone/live'] = array( 200, $list_body );
ask( 'live' );
advance( 21 );
$GLOBALS['stub']['answers']['tokenone/live'] = 'unreachable';
ask( 'live' );
$n = reads();
ask( 'live' );
check( "an answer takes a read's own record off as well: its next silence is a first one, and the read after that is made", 1 === reads() - $n, ( reads() - $n ) . ' reads' );

// The same with nothing answered in between: the list is served from its kept copy while the
// archive fails again and again. One read failing over and over is that read's own trouble.
reset_site( array( 'tokenone/past' => 'unreachable', 'tokenone/live' => array( 200, $list_body ) ) );
ask( 'live' );
foreach ( array( 0, 5, 5, 5 ) as $later ) {
	advance( $later );
	ask( 'past' );
}
advance( 6 );
$n = reads();
$r = ask( 'live' );
check( 'one read failing over and over, with no answer in between, never stops the rest being asked',
	200 === $r->status && array( 'tokenone/live' ) === array_slice( asked_paths(), $n ), describe( $r ) . ' ' . json_encode( array_slice( asked_paths(), $n ) ) );

// A finished trip's track is the one read whose cost whoever asks can choose.
$slow_track = array(
	'tokenone/live'             => array( 200, $list_body ),
	'tokenone/past/' . $listed  => 'unreachable',
	'tokenone/past/' . $crossed => array( 200, track_of( $crossed ) ),
	'tokenone/past'             => array( 200, rows_of( array( $listed, $crossed ) ) ),
	'tokenone'                  => array( 200, $envelope( 'T1' ) ),
);
reset_site( $slow_track );
ask( 'live' );
ask( 'past' );
advance( 21 );
$r = ask( 'track', 'aven-1', $listed );
check( 'a track whose read gets no answer is the same 503', 503 === $r->status && 'silex_trips_unreachable' === code_of( $r ), describe( $r ) );
$n = reads();
$r = ask( 'track', 'aven-1', strtoupper( $listed ) );
check( 'it is tried once more — a long trip may be slow the first time only', 503 === $r->status && 1 === reads() - $n, describe( $r ) . ' ' . ( reads() - $n ) . ' reads' );
$n = reads();
$again = array( ask( 'track', 'aven-1', $listed ), ask( 'track', 'aven-1', strtoupper( $listed ) ) );
check( 'and after two such reads is not asked for again for a while, however it is spelt',
	reads() === $n && array( '503 silex_trips_unreachable' ) === array_values( array_unique( $statuses( $again ) ) ), ( reads() - $n ) . ' reads ' . json_encode( $statuses( $again ) ) );
$again = array( ask( 'live' ), ask( 'own' ), ask( 'track', 'aven-1', $crossed ) );
check( 'while everything else of the cave is asked and answers: the followed list, a link\'s own trip, another track',
	array( '200 ', '200 ', '200 ' ) === $statuses( $again ) && 3 === reads() - $n, json_encode( $statuses( $again ) ) . ' ' . ( reads() - $n ) . ' reads' );
advance( 21 );
$n = reads();
ask( 'track', 'aven-1', $listed );
ask( 'track', 'aven-1', $listed );
check( 'twenty seconds on the track is tried once, and once only', 1 === reads() - $n, ( reads() - $n ) . ' reads' );

reset_site( array( 'tokenone/past/' . $crossed => 'unreachable' ) + $slow_track );
foreach ( array( 0, 0, 21, 0 ) as $later ) {
	advance( $later );
	ask( 'track', 'aven-1', $listed );
	ask( 'track', 'aven-1', $crossed );
}
$again = array( ask( 'live' ), ask( 'own' ) );
check( 'however many tracks get no answer, and however often, that is never taken for the installation being down',
	array( '200 ', '200 ' ) === $statuses( $again ), json_encode( $statuses( $again ) ) );

reset_site( array( 'tokenone/live' => 'unreachable', 'tokenone' => 'unreachable' ) + $slow_track );
ask( 'past' );
ask( 'live' );
ask( 'own' );
$n = reads();
$r = ask( 'track', 'aven-1', $crossed );
check( 'a track is not asked for either while the installation is known not to answer', 503 === $r->status && reads() === $n, describe( $r ) . ' ' . ( reads() - $n ) . ' reads' );

reset_site( array( 'tokena/past' => 'unreachable', 'tokena' => 'unreachable', 'tokenb/past' => array( 200, $list_body ) ), false, array( 'a-1' => 'tokena', 'b-1' => 'tokenb' ) );
ask( 'past', 'a-1' );
ask( 'own', 'a-1' );
$n = reads();
ask( 'past', 'a-1' );
$r = ask( 'past', 'b-1' );
check( 'what one group could not reach is not held against another', 200 === $r->status && 1 === reads() - $n, describe( $r ) . ' ' . ( reads() - $n ) . ' reads' );

reset_site( array( 'tokenone/live' => array( 200, $list_body ) ) );
$GLOBALS['stub']['options'][ SILEX_TRIPS_OPTION ]['base'] = '';
$r = ask( 'live' );
check( 'a site with links and no installation to ask says so, and asks nobody', 503 === $r->status && 'silex_trips_unconfigured' === code_of( $r ) && 0 === reads(), describe( $r ) );

echo "whose address the installation is told\n";

$hostile = array(
	'REMOTE_ADDR'          => '198.51.100.7',
	'HTTP_X_FORWARDED_FOR' => '203.0.113.9',
	'HTTP_CLIENT_IP'       => '203.0.113.10',
	'HTTP_X_REAL_IP'       => '203.0.113.11',
	'HTTP_FORWARDED'       => 'for=203.0.113.12',
);
$forwarded = function () {
	return array_map( function ( $args ) { return isset( $args['headers']['X-Forwarded-For'] ) ? $args['headers']['X-Forwarded-For'] : null; }, $GLOBALS['stub']['sent'] );
};
reset_site( array( 'tokenthree/past' => array( 200, $list_body ) ) );
$_SERVER = $hostile;
ask( 'past' );
check( "every read of a walk through the links carries the reader's address, as the connection gave it",
	3 === reads() && array( '198.51.100.7' ) === array_values( array_unique( $forwarded() ) ), json_encode( $forwarded() ) );
check( 'and nothing the reader wrote about themselves in a header leaves this server',
	false === strpos( json_encode( $GLOBALS['stub']['sent'] ), '203.0.113' ), json_encode( $GLOBALS['stub']['sent'] ) );

reset_site( array( 'tokenone' => array( 200, $envelope( 'T1' ) ), 'tokentwo' => array( 200, $envelope( 'T2' ) ) ), 'no' );
$_SERVER = $hostile;
ask( 'live' );
check( 'the same for each link read on its own',
	3 === reads() && array( '198.51.100.7' ) === array_values( array_unique( $forwarded() ) ), json_encode( $forwarded() ) );

reset_site( array( 'tokenone/past' => array( 200, $list_body ) ) );
$_SERVER = array( 'REMOTE_ADDR' => '2001:db8:1:2:aaaa:bbbb:cccc:dddd' );
ask( 'past' );
check( 'an IPv6 reader is forwarded too', array( '2001:db8:1:2:aaaa:bbbb:cccc:dddd' ) === $forwarded(), json_encode( $forwarded() ) );

foreach ( array( '', 'unknown', '198.51.100.7, 203.0.113.9', "198.51.100.7\r\nX-Evil: 1" ) as $bad ) {
	reset_site( array( 'tokenone/past' => array( 200, $list_body ) ) );
	$_SERVER = array( 'REMOTE_ADDR' => $bad, 'HTTP_X_FORWARDED_FOR' => '203.0.113.9' );
	ask( 'past' );
	check( 'an address that is not one address (' . json_encode( $bad ) . ') is not forwarded at all, nor replaced by a header',
		1 === reads() && array( 'Accept' ) === array_keys( $GLOBALS['stub']['sent'][0]['headers'] ), json_encode( $GLOBALS['stub']['sent'][0] ) );
}

echo "when the installation says how long to wait\n";

$refusal = function ( $retry_after ) {
	return array( 'tokenone/live' => array( 429, '', array( 'retry-after' => $retry_after ) ) );
};
reset_site( $refusal( '37' ) );
$r = ask( 'live' );
check( 'its refusal is a 503 here that says the same wait', 503 === $r->status && '37' === header_of( $r, 'Retry-After' ), describe( $r ) );
check( 'with the body the page reads: a code of the proxy\'s own and the status',
	'silex_trips_unavailable' === code_of( $r ) && 503 === $r->data['data']['status'] && 429 === $r->data['data']['upstream'], json_encode( $r->data ) );

reset_site( $refusal( '86400' ) );
check( 'a wait longer than ten minutes is passed on as ten', '600' === header_of( ask( 'live' ), 'Retry-After' ) );
reset_site( $refusal( gmdate( 'D, d M Y H:i:s', time() + 30 ) . ' GMT' ) );
$after = header_of( ask( 'live' ), 'Retry-After' );
check( 'a wait given as a date is passed on as seconds', null !== $after && $after >= 28 && $after <= 31, var_export( $after, true ) );
foreach ( array( '', 'soon', '-5', '0', 'tomorrow' ) as $unusable ) {
	reset_site( $refusal( $unusable ) );
	$r = ask( 'live' );
	check( 'a wait that says nothing usable (' . json_encode( $unusable ) . ') is a 503 with none', 503 === $r->status && null === header_of( $r, 'Retry-After' ), describe( $r ) );
}
foreach ( array( 'own' => 'tokenone', 'past' => 'tokenone/past', 'track' => 'tokenone/past/' . $uuid ) as $which => $path ) {
	$answers          = array( 'tokenone/past' => array( 200, rows_of( array( $uuid ) ) ) );
	$answers[ $path ] = array( 503, '', array( 'retry-after' => '9' ) );
	reset_site( $answers );
	$r = ask( $which, 'aven-1', 'track' === $which ? $uuid : null );
	check( "the same on the other routes ($which)", 503 === $r->status && '9' === header_of( $r, 'Retry-After' ), describe( $r ) );
}
reset_site( array( 'tokenone' => array( 404, '' ), 'tokentwo' => array( 503, '', array( 'retry-after' => '12' ) ) ), 'no' );
$r = ask( 'live' );
check( 'a list assembled from the links passes the wait on as well', 503 === $r->status && '12' === header_of( $r, 'Retry-After' ), describe( $r ) );
reset_site( array( 'tokenone/past' => array( 404, '', array( 'retry-after' => '37' ) ) ) );
$r = ask( 'past' );
check( 'a refusal of a link is not a wait: a 404 carries none', 404 === $r->status && null === header_of( $r, 'Retry-After' ), describe( $r ) );

echo "how long a browser may keep an answer\n";

$everything = array(
	'tokenone/live'           => array( 200, $list_body ),
	'tokenone/past/' . $uuid => array( 200, track_of( $uuid ) ),
	'tokenone/past'           => array( 200, rows_of( array( $uuid ) ) ),
	'tokenone'                => array( 200, $envelope( 'T1' ) ),
);
// Each route with how long its answer is kept here. A browser is told twenty seconds at most,
// and less where the kept copy has less than that left.
foreach ( array( 'own' => 20, 'live' => 20, 'past' => 300, 'track' => 60 ) as $which => $kept ) {
	reset_site( $everything );
	$r   = ask( $which, 'aven-1', 'track' === $which ? $uuid : null );
	$age = max_age( $r );
	check( "a fresh answer ($which) says so: private, for twenty seconds at most",
		200 === $r->status && null !== $age && $age <= 20 && $age >= 19, describe( $r ) );
	check( '  and is cleared of what a session elsewhere on the site announced',
		array( 'Pragma', 'Expires' ) === $GLOBALS['stub']['server']->removed, json_encode( $GLOBALS['stub']['server']->removed ) );
	advance( 7 );
	$n     = reads();
	$older = max_age( ask( $which, 'aven-1', 'track' === $which ? $uuid : null ) );
	$most  = min( 20, $kept - 7 );
	check( "  the same answer seven seconds on: for $most seconds, no longer than the kept copy has left",
		reads() === $n && null !== $older && $older <= $most && $older >= $most - 1, var_export( $older, true ) );
}
reset_site( $everything );
ask( 'past' );
advance( 295 );
$r = ask( 'past' );
check( 'an archive five seconds from lapsing here may be kept five seconds there', 200 === $r->status && null !== max_age( $r ) && max_age( $r ) <= 5, describe( $r ) );
reset_site( array(), 'no' );
$r = ask( 'live' );
check( 'a list of nothing but remembered refusals may not be kept at all', 200 === $r->status && 0 === max_age( $r ), describe( $r ) );

foreach ( array( array( 404, '' ), array( 500, '' ), array( 429, '' ), array( 200, 'not json' ), 'unreachable' ) as $fault ) {
	reset_site( array( 'tokenone/past' => $fault, 'tokentwo/past' => $fault, 'tokenthree/past' => $fault ) );
	$r = ask( 'past' );
	check( 'what is not an answer (' . ( is_array( $fault ) ? $fault[0] . ( 200 === $fault[0] ? ', unreadable' : '' ) : $fault ) . ') is not to be kept by anybody',
		200 !== $r->status && 'no-store' === header_of( $r, 'Cache-Control' ), describe( $r ) );
}
reset_site( array() );
$r = ask( 'past', 'nosuch-1' );
check( 'nor is the refusal of a slot the site does not hold', 'no-store' === header_of( $r, 'Cache-Control' ), describe( $r ) );
$r = filtered( new WP_REST_Response( array( 'code' => 'x', 'data' => array( 'status' => 503, 'retry_after' => 5 ) ), 503 ), '/wp/v2/posts' );
check( "another plugin's route is left as it was", array() === $r->headers && array() === $GLOBALS['stub']['server']->removed, json_encode( $r->headers ) );

echo "what is relayed of the installation's files\n";

// Beside a trip the installation describes the survey it is drawn on, with addresses of its
// files that carry a signature. Invented here; the shape is the installation's.
$signed = function ( $path ) { return '/api/v1/files/' . $path . 'token=INVENTED.SIGNATURE'; };
$model  = array(
	'format'          => 'lox',
	'modelUrl'        => $signed( 'f1/content?' ),
	'meshUrl'         => $signed( 'f2/content?' ),
	'anchorLongitude' => 1.5,
	'places'          => array( array( 'station' => 's.1', 'label' => 'a place' ), array( 'station' => 's.2', 'label' => 'another' ) ),
	'pictures'        => array(
		array( 'stationName' => 's.1', 'thumbnailUrl' => $signed( 'f3/thumbnail?size=480&' ), 'caption' => 'c' ),
		array( 'stationName' => 's.2', 'thumbnailUrl' => $signed( 'f4/thumbnail?size=480&' ), 'caption' => null ),
	),
	'rasterMaps'      => array( array( 'title' => 'm', 'imageUrl' => $signed( 'f5/thumbnail?size=2000&' ), 'points' => array( array( 'station' => 's.1', 'x' => 1, 'y' => 2 ) ) ) ),
);
reset_site( array(
	'tokenone/past'           => array( 200, rows_of( array( $uuid ) ) ),
	'tokenone/past/' . $uuid => array( 200, json_encode( array( 'tripLogId' => $uuid, 'track' => true, 'model' => $model ) ) ),
	'tokenone'                => array( 200, json_encode( array( 'tripLogId' => 'T1', 'title' => 't', 'model' => $model, 'participants' => array( array( 'label' => 'p' ) ) ) ) ),
) );
foreach ( array( 'own' => "a link's own trip", 'track' => "a finished trip's track" ) as $which => $said ) {
	$r    = ask( $which, 'aven-1', 'track' === $which ? $uuid : null );
	$sent = json_encode( $r->data );
	check( "$said is relayed without a signed address of the installation's files", 200 === $r->status && false === strpos( $sent, 'token=' ), $sent );
	check( '  the places the cave declares are relayed as they came', 200 === $r->status && isset( $r->data['model']['places'] ) && $model['places'] === $r->data['model']['places'], $sent );
	check( '  and so is the rest of what is said of the survey, lists still lists',
		200 === $r->status && isset( $r->data['model'] )
		&& 'lox' === $r->data['model']['format'] && 1.5 === $r->data['model']['anchorLongitude']
		&& array( array( 'stationName' => 's.1', 'caption' => 'c' ), array( 'stationName' => 's.2', 'caption' => null ) ) === $r->data['model']['pictures']
		&& $model['rasterMaps'][0]['points'] === $r->data['model']['rasterMaps'][0]['points'], $sent );
}
check( 'nothing kept on this server carries one either', false === strpos( json_encode( kept_answers() ), 'token=' ) );
$r = ask( 'own' );
check( 'what is said of the trip itself is untouched', 'T1' === $r->data['tripLogId'] && array( array( 'label' => 'p' ) ) === $r->data['participants'], json_encode( $r->data ) );

echo "how long a finished trip's track is remembered\n";

// A closed trip's log is still corrected in place, and the installation re-decides on every
// read whether the link opens it: a track cached for an hour serves a corrected-away position
// and a revoked link for an hour. The bound is the premise, so it is asserted.
reset_site( array( 'tokenone/past' => array( 200, rows_of( array( $uuid ) ) ), 'tokenone/past/' . $uuid => array( 200, track_of( $uuid ) ) ) );
$r = ask( 'track', 'aven-1', $uuid );
$track_ttl = null;
foreach ( kept_answers() as $key => $value ) {
	if ( is_array( $value ) && ! empty( $value['track'] ) ) { $track_ttl = (int) $GLOBALS['stub']['ttls'][ $key ]; }
}
check( 'a track that answered is remembered', 200 === $r->status && null !== $track_ttl, describe( $r ) );
check( 'and kept for a minute at most', null !== $track_ttl && $track_ttl <= 60, var_export( $track_ttl, true ) );

echo "forgetting, on a site whose transients live in an object cache\n";

// With a Redis or Memcached plugin a transient is not a row in wp_options, so a DELETE there
// clears nothing; the stubs above are exactly that backend. What is asserted is that after
// "Empty the cache" (and after saving the links, which forgets the same way) the
// next read reaches the installation and the remembered shape is gone — on this backend too.
reset_site( array( 'tokenone/live' => array( 200, $list_body ) ) );
ask( 'live' );
ask( 'live' );
check( 'an answered list is served from memory on the next read', 1 === reads(), reads() );
$GLOBALS['stub']['answers'] = array( 'tokenone/live' => array( 200, json_encode( array( 'trips' => array(), 'more' => false ) ) ) );
silex_trips_forget();
check( 'forgetting does not itself read the installation', 1 === reads(), reads() );
check( 'and forgets the remembered shape', false === shape(), var_export( shape(), true ) );
$r = ask( 'live' );
check( 'the read after forgetting reaches the installation', 2 === reads(), reads() );
check( 'and answers what it says now, not what was remembered', 200 === $r->status && array() === $r->data['trips'], describe( $r ) );
check( 'the rows are still cleared where they are rows', count( $GLOBALS['wpdb']->queries ) >= 1 && false !== strpos( $GLOBALS['wpdb']->queries[0], 'DELETE' ), json_encode( $GLOBALS['wpdb']->queries ) );

reset_site( array( 'tokenone/past' => 'unreachable', 'tokenone/live' => 'unreachable', 'tokenone' => array( 404, '' ) ) );
ask( 'own' );
ask( 'past' );
ask( 'live' );
$GLOBALS['stub']['answers'] = array( 'tokenone/past' => array( 200, $list_body ), 'tokenone' => array( 200, $envelope( 'T1' ) ) );
$n = reads();
$before = array( ask( 'past' )->status, ask( 'own' )->status );
silex_trips_forget();
check( 'what was remembered of a failure and of a refusal is forgotten with the rest',
	array( 503, 404 ) === $before && reads() === $n && 200 === ask( 'past' )->status && 200 === ask( 'own' )->status, json_encode( $before ) );

echo "the screen the links are kept on\n";

// One press of a button on the settings screen: what it showed afterwards.
function screen( $post = array() ) {
	$_POST = $post;
	ob_start();
	try { silex_trips_screen(); } finally { $html = ob_get_clean(); $_POST = array(); }
	$shown = array( 'html' => $html, 'kind' => null, 'notice' => '', 'base' => null, 'links' => null );
	if ( preg_match( '~<div class="notice notice-(\w+)"><p>(.*?)</p></div>~s', $html, $m ) ) {
		$shown['kind']   = $m[1];
		$shown['notice'] = html_entity_decode( $m[2], ENT_QUOTES );
	}
	// Read the way the site's own tool for these links reads the screen.
	if ( preg_match( '~id="silex_trips_base"[^>]*value="([^"]*)"~', $html, $m ) ) { $shown['base'] = html_entity_decode( $m[1], ENT_QUOTES ); }
	if ( preg_match( '~<textarea name="silex_trips_slots"[^>]*>(.*?)</textarea>~s', $html, $m ) ) { $shown['links'] = html_entity_decode( $m[1], ENT_QUOTES ); }
	return $shown;
}
function save( $base, $links ) {
	return screen( array( 'silex_trips_save' => '1', 'silex_trips_base' => $base, 'silex_trips_slots' => $links ) );
}
function saved() { return $GLOBALS['stub']['options'][ SILEX_TRIPS_OPTION ]; }
function fresh_screen( $answers = array() ) {
	reset_site( $answers, false, array( 'kept-1' => 'tokenkept' ) );
}
$alive = array( 'tokenone' => array( 200, $envelope( 'T1' ) ), 'tokentwo' => array( 200, $envelope( 'T2' ) ) );

fresh_screen( $alive );
$s = save( 'https://installation.invalid', "aven-1 = tokenone\naven-2 = tokentwo" );
check( 'a save the installation answers for is said to be saved', 'success' === $s['kind'] && false !== strpos( $s['notice'], 'Saved: 2 links' ), $s['kind'] . ': ' . $s['notice'] );
check( 'and is kept: the address and the links by name',
	'https://installation.invalid' === saved()['base'] && array( 'aven-1' => 'tokenone', 'aven-2' => 'tokentwo' ) === saved()['slots'], json_encode( saved() ) );
check( 'what it asked of the installation in order to say so is left in no cache',
	reads() >= 2 && 0 === count( $GLOBALS['stub']['transients'] ), reads() . ' reads, ' . count( $GLOBALS['stub']['transients'] ) . ' things kept' );

fresh_screen( $alive );
$s = save( 'https://installation.invalid/api/v1/?x=1#f', 'aven-1 = tokenone' );
check( 'an address typed with a path is kept as scheme and domain', 'https://installation.invalid' === saved()['base'], json_encode( saved()['base'] ) );
$GLOBALS['stub']['requested'] = array();
ask( 'own' );
check( 'so that the next read asks the path the installation has',
	array( 'https://installation.invalid/api/v1/public/trips/tokenone' ) === $GLOBALS['stub']['requested'], json_encode( $GLOBALS['stub']['requested'] ) );
check( 'and the notice says the address was shortened', false !== strpos( $s['notice'], 'the scheme and the domain' ), $s['notice'] );

fresh_screen( $alive );
$s = save( 'installation.invalid:8443', 'aven-1 = tokenone' );
check( 'an address that is not one is refused, not saved as nothing', 'error' === $s['kind'], $s['kind'] . ': ' . $s['notice'] );
check( 'what was kept before is still kept', array( 'kept-1' => 'tokenkept' ) === saved()['slots'] && 'https://installation.invalid' === saved()['base'], json_encode( saved() ) );
check( 'and what was typed is offered back', 'installation.invalid:8443' === $s['base'] && 'aven-1 = tokenone' === trim( (string) $s['links'] ), json_encode( array( $s['base'], $s['links'] ) ) );

fresh_screen( array() );
$s = save( 'https://installation.invalid', "aven-1 = tokenone\naven-2 = tokentwo" );
check( 'a save every link of which the installation refuses says so, not plain "saved"',
	'success' !== $s['kind'] && false !== strpos( $s['notice'], '404' ), $s['kind'] . ': ' . $s['notice'] );
check( 'the links are kept all the same: it may be the installation that is wrong', 2 === count( saved()['slots'] ) );

fresh_screen( array( 'tokenone' => 'unreachable' ) );
$s = save( 'https://installation.invalid', "aven-1 = tokenone\naven-2 = tokentwo" );
check( 'a save that leaves the installation unreachable says so, not plain "saved"',
	'success' !== $s['kind'] && false !== strpos( $s['notice'], 'could not be reached' ), $s['kind'] . ': ' . $s['notice'] );
check( 'having waited for it once, not once per link', 1 === reads(), reads() . ' reads' );

fresh_screen( array( 'tokenone' => array( 200, $envelope( 'T1' ) ), 'tokenthree/past' => array( 200, $list_body ) ) );
$s = save( 'https://installation.invalid', "aven-1 = tokenone\naven-2 = tokentwo\naven-3 = tokenthree" );
check( 'a save with one dead link among live ones names it',
	false !== strpos( $s['notice'], 'aven-2' ) && false === strpos( $s['notice'], 'aven-1' ) && false === strpos( $s['notice'], 'aven-3' ), $s['kind'] . ': ' . $s['notice'] );
check( 'and never shows a token in saying so', false === strpos( $s['notice'], 'token' ), $s['notice'] );

fresh_screen( $alive );
$long = str_repeat( 'n', 60 );
$s = save( 'https://installation.invalid', "aven-1 = tokenone\n$long = tokentwo" );
check( 'a name longer than an address can carry is refused, naming its line',
	'error' === $s['kind'] && false !== strpos( $s['notice'], 'line 2' ) && array( 'kept-1' => 'tokenkept' ) === saved()['slots'], $s['kind'] . ': ' . $s['notice'] );
fresh_screen( $alive );
$s = save( 'https://installation.invalid', "bad name! = tokenone\nbadname = tokentwo" );
check( 'a name with characters an address cannot carry is refused, not rewritten into another name',
	'error' === $s['kind'] && false !== strpos( $s['notice'], 'line 1' ) && ! isset( saved()['slots']['badname'] ), $s['kind'] . ': ' . $s['notice'] );
fresh_screen( $alive );
$s = save( 'https://installation.invalid', "aven-1 = tokenone\n\naven-1 = tokentwo" );
check( 'a name given twice is refused, naming both lines',
	'error' === $s['kind'] && false !== strpos( $s['notice'], 'line 3' ) && false !== strpos( $s['notice'], 'line 1' ), $s['kind'] . ': ' . $s['notice'] );
fresh_screen( $alive );
$s = save( 'https://installation.invalid', "aven-1 = tokenone\naven-2 tokentwo\naven-3 = token three" );
check( 'a line that is not "name = token" is refused by its number, and so is a token with a space in it',
	'error' === $s['kind'] && false !== strpos( $s['notice'], 'line 2' ) && false !== strpos( $s['notice'], 'line 3' ), $s['kind'] . ': ' . $s['notice'] );
check( 'nothing of that save is kept, the good line included', array( 'kept-1' => 'tokenkept' ) === saved()['slots'], json_encode( saved()['slots'] ) );
check( 'and the text is offered back as it was typed', "aven-1 = tokenone\naven-2 tokentwo\naven-3 = token three" === $s['links'], json_encode( $s['links'] ) );

fresh_screen( $alive );
$typed = "# the first camp\naven-1 = tokenone\n\n# the second\naven-2 = tokentwo";
$s = save( 'https://installation.invalid', $typed );
check( "an administrator's notes are not links", 'success' === $s['kind'] && array( 'aven-1' => 'tokenone', 'aven-2' => 'tokentwo' ) === saved()['slots'], $s['kind'] . ': ' . $s['notice'] );
check( 'and are still there after the save', $typed === trim( (string) $s['links'] ), json_encode( $s['links'] ) );
$s = screen();
check( 'and when the screen is opened again', $typed === trim( (string) $s['links'] ), json_encode( $s['links'] ) );
$GLOBALS['stub']['options'][ SILEX_TRIPS_OPTION ]['slots']['aven-2'] = 'tokenchanged';
$s = screen();
check( 'links written by something else since are shown as they are, not as they were typed',
	false !== strpos( (string) $s['links'], 'aven-2 = tokenchanged' ) && false === strpos( (string) $s['links'], 'tokentwo' ), json_encode( $s['links'] ) );

fresh_screen( array( 'tokenseven' => array( 200, $envelope( 'T7' ) ) ) );
save( 'https://installation.invalid', '7 = tokenseven' );
set_transient( shape_key( '7' ), 'no', 3600 );
$r = ask( 'live', '7' );
check( 'a slot named by a number is still a name on the page', 200 === $r->status && false !== strpos( json_encode( $r->data ), '"slot":"7"' ), json_encode( $r->data ) );

$apart = array( 'toka' => array( 200, $envelope( 'TA' ) ), 'tokb' => array( 200, $envelope( 'TB' ) ), 'tokc' => array( 200, $envelope( 'TC' ) ) );
fresh_screen( $apart );
$s = save( 'https://installation.invalid', "a = toka\nb = tokb" );
check( 'links that each stand alone in a group are said to, by name, with how the links of one cave are named',
	false !== strpos( $s['notice'], 'the links a, b' ) && false !== strpos( $s['notice'], 'alone in its group' ) && false !== strpos( $s['notice'], 'name-1, name-2' ), $s['kind'] . ': ' . $s['notice'] );
check( 'the save is none the less a success: both answer', 'success' === $s['kind'] && false !== strpos( $s['notice'], 'Saved: 2 links' ), $s['kind'] . ': ' . $s['notice'] );
$s = screen();
check( 'and the screen goes on saying so each time it is opened, not only after a save',
	null === $s['kind'] && false !== strpos( html_entity_decode( $s['html'], ENT_QUOTES ), 'Each of the links a, b stands alone in its group' ) );
fresh_screen( $apart );
$s = save( 'https://installation.invalid', "cave-1 = toka\ncave-2 = tokb\nother = tokc" );
check( 'one name alone beside a group is the only one named',
	false !== strpos( $s['notice'], 'The link other stands alone in its group' ) && false === strpos( $s['notice'], 'cave-1,' ), $s['kind'] . ': ' . $s['notice'] );
fresh_screen( $alive );
$s = save( 'https://installation.invalid', "aven-1 = tokenone\naven-2 = tokentwo" );
check( 'links that share a group are not said to stand alone', false === strpos( $s['notice'] . $s['html'], 'alone in its group' ), $s['notice'] );
fresh_screen( $alive );
$s = save( 'https://installation.invalid', 'only = tokenone' );
check( 'nor is the one link of a site that holds no other', false === strpos( $s['notice'] . $s['html'], 'alone in its group' ), $s['notice'] );

fresh_screen( $alive );
$s = save( 'http://installation.invalid', 'aven-1 = tokenone' );
check( 'an address without TLS is kept, and said to carry the links in clear', 'http://installation.invalid' === saved()['base'] && false !== strpos( $s['notice'], 'unencrypted' ), $s['notice'] );

fresh_screen( array( 'tokenkept/live' => array( 200, $list_body ) ) );
ask( 'live', 'kept-1' );
$s = screen( array( 'silex_trips_flush' => '1' ) );
$n = reads();
ask( 'live', 'kept-1' );
check( 'the flush button still forgets', 'The cache has been emptied.' === $s['notice'] && 1 === reads() - $n, $s['notice'] );

$s = screen();
foreach ( array(
	'that a saved link is public at once'                          => 'public from that moment',
	'that links fall through within a group only'                  => 'a group never answers through another group',
	'that the followed list is asked through the link the page names' => 'the survey of the link that asks',
	'that a name without a number is a group of one'               => 'is a group of its own',
	'that it takes two different reads without an answer to stop asking' => 'two different reads in a row',
	'what the browser may add to the kept times'                   => 'browser may keep an answer',
	'which setting tells the installation how many proxies it has' => 'SILEXGIS__Proxy__Hops',
	'which setting names the proxies it trusts'                    => 'SILEXGIS__Proxy__TrustedNetworks__0',
) as $what => $words ) {
	check( "the screen says $what", false !== strpos( $s['html'], $words ) );
}
check( "and the site's own tool can still read the address and the links off it", 'https://installation.invalid' === $s['base'] && 'kept-1 = tokenkept' === trim( (string) $s['links'] ), json_encode( array( $s['base'], $s['links'] ) ) );

echo "what the record says of this file\n";

// The section of the record that describes the proxy: from its heading to the next heading of
// the same rank, or to the end of the fenced block it is quoted in. The last of that name,
// because a change that is prepared and not yet on the server carries the section's
// replacement further down than the section it replaces.
function record_section( $text ) {
	$lines = preg_split( '/\r\n|\r|\n/', $text );
	$from  = null;
	foreach ( $lines as $index => $line ) {
		if ( 0 === strpos( $line, '## The trips proxy' ) ) { $from = $index; }
	}
	if ( null === $from ) { return null; }
	$section = array();
	for ( $i = $from + 1; $i < count( $lines ); $i++ ) {
		if ( 0 === strpos( $lines[ $i ], '## ' ) || '```' === trim( $lines[ $i ] ) ) { break; }
		$section[] = $lines[ $i ];
	}
	return implode( "\n", $section );
}
// The rows of its tables, each as its cells.
function record_rows( $section ) {
	$rows = array();
	foreach ( explode( "\n", $section ) as $line ) {
		$line = trim( $line );
		if ( '' === $line || '|' !== $line[0] || preg_match( '/^\|[\s|:-]+$/', $line ) ) { continue; }
		$rows[] = array_map( 'trim', explode( '|', trim( $line, '|' ) ) );
	}
	return $rows;
}
// Everything a text sets in code type.
function in_ticks( $text ) {
	preg_match_all( '/`([^`]+)`/', $text, $m );
	return $m[1];
}

if ( null === $record ) {
	echo "      (not read: the record does not describe another copy of the proxy, or none was asked for)\n";
} else {
	$said    = is_readable( $record ) ? record_section( (string) file_get_contents( $record ) ) : null;
	$named   = basename( $record );
	$behind  = count( $failures );
	$source  = (string) file_get_contents( $proxy );
	check( "$named has a section on the proxy", null !== $said, $record );
	$said    = (string) $said;
	$rows    = record_rows( $said );
	$ticked  = in_ticks( $said );

	// Every number this file is set by, under its name, in a row of a table.
	$wrong = array();
	foreach ( get_defined_constants( true )['user'] as $constant => $value ) {
		if ( 0 !== strpos( $constant, 'SILEX_TRIPS_' ) ) { continue; }
		if ( is_string( $value ) ) {
			if ( ! in_array( $value, $ticked, true ) ) { $wrong[] = "$constant ($value) is not in it"; }
			continue;
		}
		$found = null;
		foreach ( $rows as $row ) {
			if ( in_array( $constant, in_ticks( implode( ' ', $row ) ), true ) ) { $found = $row; }
		}
		if ( null === $found ) { $wrong[] = "$constant is in no row"; }
		elseif ( ! preg_match( '/(^|[^0-9])' . $value . ' s\b/', implode( ' | ', $found ) ) ) { $wrong[] = "$constant is not given as $value s"; }
	}
	check( 'every time this file is set by is given there, under the name it has here', array() === $wrong, implode( '; ', $wrong ) );

	preg_match_all( '/\b(\d+) s timeout|\bwithin (\d+) s\b/', $said, $m, PREG_SET_ORDER );
	$waits = array_values( array_unique( array_map( function ( $one ) { return (int) ( '' !== $one[1] ? $one[1] : $one[2] ); }, $m ) ) );
	reset_site( array() );
	ask( 'own' );
	$allowed = isset( $GLOBALS['stub']['sent'][0]['timeout'] ) ? $GLOBALS['stub']['sent'][0]['timeout'] : null;
	check( 'the wait it gives for one read is the wait this file allows', array( $allowed ) === $waits, json_encode( $waits ) . ' against ' . json_encode( $allowed ) );

	// Each route with how long its answer is kept.
	$wrong = array();
	foreach ( array( '/trips/{slot}' => SILEX_TRIPS_TTL_LIVE, '/trips/{slot}/live' => SILEX_TRIPS_TTL_LIVE, '/trips/{slot}/past' => SILEX_TRIPS_TTL_PAST, '/trips/{slot}/past/{uuid}' => SILEX_TRIPS_TTL_TRACK ) as $route => $kept ) {
		$found = array_values( array_filter( $rows, function ( $row ) use ( $route ) { return count( $row ) >= 3 && array( $route ) === in_ticks( $row[0] ); } ) );
		if ( 1 !== count( $found ) ) { $wrong[] = "$route has " . count( $found ) . ' rows'; }
		elseif ( $kept . ' s' !== $found[0][2] ) { $wrong[] = "$route is kept {$found[0][2]} there, $kept s here"; }
	}
	check( 'each route is there with the time its answer is kept', array() === $wrong, implode( '; ', $wrong ) );

	// The refusals this file can answer with, each with its status.
	preg_match_all( "/new WP_Error\\( '(silex_trips_[a-z_]+)', '[^']*', array\\( 'status' => (\\d+)/", $source, $m, PREG_SET_ORDER );
	$codes = array();
	foreach ( $m as $one ) { $codes[ $one[1] ] = (int) $one[2]; }
	$wrong = array();
	foreach ( $codes as $code => $status ) {
		if ( ! preg_grep( '/^(\d+ )?' . $code . '$/', $ticked ) ) { $wrong[] = "$code is not in it"; }
	}
	foreach ( $ticked as $tick ) {
		if ( preg_match( '/^(\d+) (silex_trips_[a-z_]+)$/', $tick, $pair ) && ( ! isset( $codes[ $pair[2] ] ) || $codes[ $pair[2] ] !== (int) $pair[1] ) ) {
			$wrong[] = "$tick is not what this file answers";
		} elseif ( preg_match( '/^silex_trips_[a-z_]+$/', $tick ) && false === strpos( $source, $tick ) ) {
			$wrong[] = "$tick is a name this file does not have";
		}
	}
	check( 'every refusal this file answers with is there, with its status, and no name this file does not have',
		count( $codes ) >= 3 && array() === $wrong, count( $codes ) . ' codes; ' . implode( '; ', $wrong ) );

	// What a kept answer and a remembered fact are called in the database.
	// A copy of the proxy from before its keys carried a generation, or before it kept
	// short memories or groups, is held to a record that says as much and no more.
	$key_said = (bool) preg_grep( '/^silex_trips_<generation>_/', $ticked );
	$carries  = 1 === preg_match( '/^silex_trips_\d+_x$/', silex_trips_key( 'x' ) );
	check( 'the names it gives the kept answers carry the generation where they do here, and not where they do not',
		$carries ? ( $key_said && ! in_array( 'silex_trips_<md5>', $ticked, true ) ) : ! $key_said, silex_trips_key( 'x' ) . ' here' );
	preg_match_all( "/silex_trips_memo_key\\( '([a-z]+)'/", $source, $m );
	$memories = array_values( array_unique( $m[1] ) );
	$missing  = array_values( array_diff( $memories, $ticked ) );
	check( 'every short memory this file keeps is named there',
		( ! function_exists( 'silex_trips_memo_key' ) || count( $memories ) >= 9 ) && array() === $missing, 'not named: ' . implode( ', ', $missing ) );

	$missing = array_values( array_filter( array_keys( silex_trips_config() ), function ( $key ) use ( $said ) { return ! preg_match( '/\b' . $key . ':/', $said ); } ) );
	check( 'the option is described with every part this file reads of it', array() === $missing, 'not there: ' . implode( ', ', $missing ) );

	$grouping = false !== strpos( $said, '-<digits>' ) && false !== stripos( $said, 'one cave' );
	check( 'it says what makes a group, and that a group is the links of one cave — where this file has groups',
		function_exists( 'silex_trips_group' ) ? ( 'x' === silex_trips_group( 'x-12' ) && $grouping ) : ! $grouping );

	// What it promises when there is no answer, row by row, against what this file then does.
	// A row is found by what it says of the installation and by the routes it names.
	$written = array( 'own' => '/trips/{slot}', 'live' => '/trips/{slot}/live', 'past' => '/trips/{slot}/past', 'track' => '/trips/{slot}/past/{uuid}' );
	$cases  = array(
		'every link refusing (404)'           => array( '/^`404`/', function () { reset_site( array() ); } ),
		'a fault or the limiter (429)'        => array( '/`429`/', function () { reset_site( array() ); $GLOBALS['stub']['upstream'] = function () { return array( 429, '' ); }; } ),
		'no answer at all'                    => array( '/^nothing within/', function () { reset_site( array() ); $GLOBALS['stub']['upstream'] = function () { return 'unreachable'; }; } ),
		'an answer that cannot be read'       => array( '/not JSON/', function () { reset_site( array() ); $GLOBALS['stub']['upstream'] = function () { return array( 200, 'not json' ); }; } ),
		'no address for the installation'     => array( '/no installation address/', function () { reset_site( array() ); $GLOBALS['stub']['options'][ SILEX_TRIPS_OPTION ]['base'] = ''; } ),
	);
	foreach ( $cases as $case => $how ) {
		$wrong = array();
		foreach ( $written as $which => $route ) {
			$how[1]();
			$r     = ask( $which, 'aven-1', 'track' === $which ? $uuid : null );
			$does  = trim( $r->status . ' ' . code_of( $r ) );
			$found = array_values( array_filter( $rows, function ( $row ) use ( $how, $route ) {
				return count( $row ) >= 3 && preg_match( $how[0], $row[0] ) && ( in_array( $route, in_ticks( $row[1] ), true ) || false !== stripos( $row[1], 'every route' ) );
			} ) );
			$says  = ( 1 === count( $found ) && in_ticks( $found[0][2] ) ) ? in_ticks( $found[0][2] )[0] : count( $found ) . ' rows';
			if ( $says !== $does ) { $wrong[] = $route . ': [' . $says . '] there, [' . $does . '] here'; }
		}
		check( "what it promises for $case is what each route answers", array() === $wrong, implode( '; ', $wrong ) );
	}
	if ( count( $failures ) > $behind ) {
		echo "      ($named is behind this file in " . ( count( $failures ) - $behind ) . " of these: its section on the proxy has to be brought level — or, to read another record, name it as the second argument)\n";
	}
}

echo "what PHP had to say\n";

check( 'nothing: no warning, notice or deprecation in any of the above', array() === $GLOBALS['php_said'],
	count( $GLOBALS['php_said'] ) . ': ' . implode( ' | ', array_slice( array_unique( $GLOBALS['php_said'] ), 0, 5 ) ) );

echo "\n" . ( $failures ? count( $failures ) . ' of ' . $checked . ' failed' : 'all good (' . $checked . ')' ) . "\n";
exit( $failures ? 1 : 0 );
