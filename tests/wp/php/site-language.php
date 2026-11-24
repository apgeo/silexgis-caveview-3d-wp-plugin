<?php
// Sets the site's language directly in the options table: WordPress's own sanitising of the
// option keeps only languages whose WordPress pack is installed, and the point is a site in a
// language only the plugin's own translation speaks.
//
//   php site-language.php <locale, or '' for English>
require '/var/www/html/wp-load.php';

global $wpdb;
if ( false === get_option( 'WPLANG', false ) ) {
	add_option( 'WPLANG', '' );
}
$wpdb->update( $wpdb->options, array( 'option_value' => $argv[1] ), array( 'option_name' => 'WPLANG' ) );
wp_cache_delete( 'WPLANG', 'options' );
wp_cache_delete( 'alloptions', 'options' );
unset( $GLOBALS['locale'] );
echo get_locale();
