<?php
/**
 * Plugin Name:       SilexGIS CaveView 3D
 * Plugin URI:        https://github.com/apgeo/silexgis-caveview-3d-wp-plugin
 * Description:       A cave's 3D survey model on a page — its places, photographs and the trips a SilexGIS installation publishes — driven by configuration.
 * Version:           1.0.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            SilexGIS
 * Author URI:        https://github.com/apgeo
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       silexgis-caveview-3d
 * Domain Path:       /languages
 * Update URI:        false
 *
 * WHAT THIS PLUGIN IS
 *
 *   - the stylesheet and scripts of a page carrying a model are enqueued by the plugin,
 *     never written into post content, because the block editor strips asset tags from
 *     anything that is not a raw-HTML block;
 *   - [silexgis_cave] expands to the container markup the component needs, and four
 *     smaller shortcodes to the sections of an expedition journal;
 *   - a page's configuration — the argument of SilexCaveEmbed.create() — comes from a
 *     meta box on the page, or from a pages/<slug>.js file, or from the file the
 *     shortcode's config="..." attribute names;
 *   - the alias table that turns place names in the prose into links has its screen
 *     under Settings, and a cave's published trips are read through a same-origin
 *     proxy that keeps the SilexGIS share links in the site's options;
 *   - the site keeps its own copy of each cave's data (survey, places, photographs,
 *     trips) and can import data sets from zip archives.
 *
 * The component (assets/) and a build of the CaveView.js fork it is written against
 * (vendor/caveview/) ship inside the plugin; either can be replaced by a directory on the
 * site, named on Settings → 3D models.
 *
 * LANGUAGES
 *
 * Every word the plugin's admin screens print is written in English and goes through the
 * WordPress translation functions under the text domain silexgis-caveview-3d. The
 * translations are the plugin's own, in languages/: WordPress picks the file by the language
 * it determines for the request — the site's (Settings → General), or in the admin the
 * user's own when their profile names one. languages/silexgis-caveview-3d.pot is the
 * template a new language starts from.
 *
 * NOT IN ANY PUBLIC DIRECTORY (YET)
 *
 * "Update URI: false" above says that this plugin has no update source. WordPress reports
 * every ordinary plugin to wordpress.org's update check by its directory name, and without
 * that line anybody who registered a plugin there under this one's name, with a higher
 * version, would have it offered to this site as an update of this plugin.
 */

defined( 'ABSPATH' ) || exit;

define( 'SILEX_CE_VERSION', '1.0.0' );
define( 'SILEX_CE_FILE', __FILE__ );
define( 'SILEX_CE_DIR', __DIR__ );
define( 'SILEX_CE_SLUG', 'silexgis-caveview-3d' );

/** The build of the CaveView.js fork shipped under vendor/caveview/. */
define( 'SILEX_CE_CAVEVIEW_BUILD', '2.9.0-slx.23' );

/** The shortcode that puts a model on a page; the journal's shortcodes carry it as their prefix. */
define( 'SILEX_CE_SHORTCODE', 'silexgis_cave' );

/** The namespace of the plugin's public REST routes: the trips proxy and the cave data. */
define( 'SILEX_CE_REST_NAMESPACE', 'silexgis-caveview/v1' );

/** The plugin's directory under wp-content/uploads/: the site's copy of each cave, imported data sets, page files. */
define( 'SILEX_CE_UPLOADS_DIR', 'silexgis-caveview-3d' );

/** Post meta holding a page's configuration: the JSON object SilexCaveEmbed.create() receives. */
define( 'SILEX_CE_META_KEY', '_silex_cave_embed_config' );

/** Optional override directories for the component and the viewer build ('' = the copies the plugin ships). */
define( 'SILEX_CE_OPTION_ASSETS_BASE', 'silex_ce_assets_base' );
define( 'SILEX_CE_OPTION_CAVEVIEW_HOME', 'silex_ce_caveview_home' );

/**
 * How large every model on the site writes the names of its stations and their comments, as
 * a part of the viewer's own size: "1" is the viewer's, "0.6" six tenths of it. A page whose
 * configuration says `labelScale` is not overruled.
 */
define( 'SILEX_CE_OPTION_LABEL_SCALE', 'silex_ce_label_scale' );
define( 'SILEX_CE_DEFAULT_LABEL_SCALE', '1' );
define( 'SILEX_CE_LABEL_SCALE_MIN', 0.2 );
define( 'SILEX_CE_LABEL_SCALE_MAX', 3 );
// The language a page with a model opens in where neither the page nor the reader says another:
// one the component offers, or "auto" — the site's own language where the component offers it,
// English where it does not. "auto" is the default.
define( 'SILEX_CE_OPTION_LANGUAGE', 'silex_ce_language' );
define( 'SILEX_CE_LANGUAGES', array( 'ro' => 'Română', 'en' => 'English' ) );
define( 'SILEX_CE_LANGUAGE_AUTO', 'auto' );

add_action( 'plugins_loaded', 'silex_ce_boot' );
add_action( 'init', 'silex_ce_load_textdomain' );

function silex_ce_load_textdomain() {
	load_plugin_textdomain( 'silexgis-caveview-3d', false, dirname( plugin_basename( __FILE__ ) ) . '/languages' );
}

function silex_ce_boot() {
	// A second copy of the plugin (another directory name), or an older site-specific plugin
	// that declares the same functions, would make every request a fatal error. Stand aside
	// and say so instead.
	if ( function_exists( 'silex_ce_asset_sets' ) || function_exists( 'silex_cave_asset_sets' ) ) {
		add_action( 'admin_notices', 'silex_ce_conflict_notice' );
		return;
	}

	require_once SILEX_CE_DIR . '/includes/trips-proxy.php';
	require_once SILEX_CE_DIR . '/includes/trips-bundle.php';
	require_once SILEX_CE_DIR . '/includes/cave-data.php';
	require_once SILEX_CE_DIR . '/includes/admin-autolink.php';

	require_once SILEX_CE_DIR . '/includes/assets.php';
	require_once SILEX_CE_DIR . '/includes/shortcode.php';
	require_once SILEX_CE_DIR . '/includes/meta-box.php';
	require_once SILEX_CE_DIR . '/includes/settings.php';

	add_filter( 'plugin_action_links_' . plugin_basename( SILEX_CE_FILE ), 'silex_ce_guard_deactivation' );
}

/**
 * How many published posts and pages this plugin is serving a model on: those whose
 * content carries one of the asset sets' markers or the shortcode. The markers are read
 * from the sets, so this cannot come to disagree with the enqueue hook about what a model
 * page is.
 */
function silex_ce_count_model_pages() {
	global $wpdb;

	$sets  = silex_ce_asset_sets();
	$likes = array();
	foreach ( $sets as $set ) {
		$likes[] = $wpdb->prepare( 'post_content LIKE %s', '%' . $wpdb->esc_like( $set['marker'] ) . '%' );
		if ( ! empty( $set['shortcode'] ) ) {
			$likes[] = $wpdb->prepare( 'post_content LIKE %s', '%' . $wpdb->esc_like( '[' . $set['shortcode'] ) . '%' );
		}
	}
	// The LIKEs only narrow the table down; the same test the enqueue hook uses decides.
	$candidates = $wpdb->get_col(
		"SELECT post_content FROM {$wpdb->posts} WHERE post_status = 'publish' AND post_type NOT IN ( 'revision', 'nav_menu_item' ) AND ( " . implode( ' OR ', $likes ) . ' ) LIMIT 500'
	);
	$count = 0;
	foreach ( (array) $candidates as $content ) {
		foreach ( $sets as $set ) {
			if ( silex_ce_set_wants( $set, $content ) ) {
				$count ++;
				break;
			}
		}
	}

	return $count;
}

/**
 * The Deactivate link on the Plugins screen, made to ask first while any published page
 * carries a model.
 *
 * Switching the plugin off stops every model page at once — no stylesheet, no scripts, the
 * shortcode shown to readers as text — and takes the published trips' routes away, and
 * nothing on the public side says why. The question names both, so the click is a decision
 * rather than a slip. It guards this link only: the bulk action above the list and a
 * deactivation by other means ask nothing.
 */
function silex_ce_guard_deactivation( $actions ) {
	if ( empty( $actions['deactivate'] ) || ! is_string( $actions['deactivate'] ) ) {
		return $actions;
	}
	$pages = silex_ce_count_model_pages();
	if ( ! $pages ) {
		return $actions;
	}
	$question = sprintf(
		/* translators: 1: number of published pages carrying a model, 2: the shortcode, 3: the REST namespace */
		_n(
			'Deactivating SilexGIS CaveView 3D stops the 3D model on %1$d published page (its styles and scripts no longer load, and the [%2$s] shortcode shows as text) and the published trips\' proxy (the %3$s routes answer 404). Deactivate the plugin?',
			'Deactivating SilexGIS CaveView 3D stops the 3D models on %1$d published pages (their styles and scripts no longer load, and the [%2$s] shortcode shows as text) and the published trips\' proxy (the %3$s routes answer 404). Deactivate the plugin?',
			$pages,
			'silexgis-caveview-3d'
		),
		$pages,
		SILEX_CE_SHORTCODE,
		SILEX_CE_REST_NAMESPACE
	);
	// Onto the link WordPress made, whatever else it carries: the question is the only
	// thing added. As JSON it is a JavaScript string, and esc_attr() makes that safe
	// inside the attribute.
	$at = stripos( $actions['deactivate'], '<a ' );
	if ( false !== $at ) {
		$actions['deactivate'] = substr_replace(
			$actions['deactivate'],
			'<a onclick="return window.confirm(' . esc_attr( wp_json_encode( $question ) ) . ');" ',
			$at,
			3
		);
	}

	return $actions;
}

/** Shown while the plugin stands aside for other code declaring its functions. */
function silex_ce_conflict_notice() {
	if ( ! current_user_can( 'activate_plugins' ) ) {
		return;
	}
	?>
	<div class="notice notice-warning silex-ce-defers">
		<p>
			<strong>SilexGIS CaveView 3D</strong>:
			<?php esc_html_e( 'the plugin is active but loads nothing, because another plugin — a second copy of this one, or an older site-specific plugin with the same functions — is already serving the 3D models. Deactivate one of the two.', 'silexgis-caveview-3d' ); ?>
		</p>
	</div>
	<?php
}

// The site's copy of the trips is written by a scheduled event; a plugin switched off takes it off
// the schedule rather than leaving WordPress to call a function that is no longer loaded.
register_deactivation_hook( __FILE__, function () {
	wp_clear_scheduled_hook( 'silex_ce_refresh_trip_bundles' );
} );
