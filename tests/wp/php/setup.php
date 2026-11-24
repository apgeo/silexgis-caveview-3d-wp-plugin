<?php
// Puts the site into the state the check reads: the plugin active, the example data set imported
// as "example", the published-trips settings pointing at an address nothing answers on, and three
// pages — configured by the box (post meta), by a file named after the slug, and by nothing.
// Prints one line of JSON: the pages' addresses and what the import said.
//
//   php setup.php
require '/var/www/html/wp-load.php';
require_once ABSPATH . 'wp-admin/includes/plugin.php';

$out = array();
// Addresses as most sites have them (/wp-json/…), routed by WordPress's own .htaccess rules.
global $wp_rewrite;
$wp_rewrite->set_permalink_structure( '/%postname%/' );
$wp_rewrite->flush_rules( false );
// From the command line WordPress cannot tell that Apache rewrites, and writes its markers empty.
if ( false === strpos( (string) @file_get_contents( ABSPATH . '.htaccess' ), 'RewriteRule' ) ) {
	file_put_contents( ABSPATH . '.htaccess', "# BEGIN WordPress\n<IfModule mod_rewrite.c>\nRewriteEngine On\nRewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]\nRewriteBase /\nRewriteRule ^index\\.php$ - [L]\nRewriteCond %{REQUEST_FILENAME} !-f\nRewriteCond %{REQUEST_FILENAME} !-d\nRewriteRule . /index.php [L]\n</IfModule>\n# END WordPress\n" );
}
$activated = activate_plugin( 'silexgis-caveview-3d/silexgis-caveview-3d.php' );
$out['activated'] = ! is_wp_error( $activated );
// activate_plugin() includes the main file, but the hooked boot ran before it was active.
if ( ! function_exists( 'silex_ce_asset_sets' ) ) {
	silex_ce_boot();
}

// The example data set, zipped here from the repository's own directory.
$zip = sys_get_temp_dir() . '/example-set.zip';
@unlink( $zip );
$z = new ZipArchive();
$z->open( $zip, ZipArchive::CREATE );
foreach ( array( 'cave.json', 'trips.json', 'media/P8_Master.3d', 'media/example-photo.png' ) as $f ) {
	$z->addFile( '/silex-set/' . $f, $f );
}
$z->close();
$done = silex_ce_dataset_import( $zip, 'example' );
$out['import'] = $done['ok'] ? 'imported ' . $done['files'] : 'refused: ' . $done['reason'];

// One cave's links on an installation nothing answers on: the routes exist, the reads fail.
update_option( 'silex_cave_trips', array( 'base' => 'http://127.0.0.1:9', 'slots' => array( 'example-1' => 'not-a-token' ), 'text' => 'example-1 = not-a-token' ) );

function silex_test_page( $slug, $content, $meta = null ) {
	$old = get_page_by_path( $slug, OBJECT, 'page' );
	if ( $old ) {
		wp_delete_post( $old->ID, true );
	}
	$id = wp_insert_post( array( 'post_type' => 'page', 'post_status' => 'publish', 'post_title' => $slug, 'post_name' => $slug, 'post_content' => $content ) );
	if ( null !== $meta ) {
		update_post_meta( $id, '_silex_cave_embed_config', wp_slash( $meta ) );
	}
	return get_permalink( $id );
}
$shortcode = '[silexgis_cave id="cave_model" places_id="cave_places"]An example caption.[/silexgis_cave]'
	. "\n\n" . '<p>A link to <a class="cv_goto" href="#cave_model" data-selection="p8.christmas_aven.2">the foot of the aven</a>.</p>'
	. "\n\n" . '[silexgis_cave_columns][silexgis_cave_stats model="cave_model"][silexgis_cave_trip_log model="cave_model"][/silexgis_cave_columns]';

$out['box']     = silex_test_page( 'model-by-box', $shortcode, file_get_contents( '/silex-examples/page-config.json' ) );
$out['none']    = silex_test_page( 'model-unconfigured', '[silexgis_cave id="cave_model"]' );
$out['plain']   = silex_test_page( 'no-model', '<p>No model here.</p>' );
// A hand-built model page that loads its own viewer, with markup like ours: left alone.
kses_remove_filters();
$out['own']     = silex_test_page( 'own-viewer', '<div class="cave_embed_model" id="cave_model_scene_1"></div><script src="/somewhere/CaveView/js/CaveView2.js"></script>' );

// A page configured by a file named after its slug, in the pages' directory under the uploads.
$pages = silex_ce_pages_dir();
wp_mkdir_p( $pages['file'] );
$config = json_decode( file_get_contents( '/silex-examples/page-config.json' ), true );
file_put_contents( $pages['file'] . 'model-by-file.js', 'window.SilexCaveEmbed.create(' . wp_json_encode( $config ) . ');' );
$out['file']    = silex_test_page( 'model-by-file', '[silexgis_cave id="cave_model" places_id="cave_places"]' );

echo wp_json_encode( $out ) . "\n";
