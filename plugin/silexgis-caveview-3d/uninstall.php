<?php
/**
 * Runs when the plugin is deleted from the Plugins screen.
 *
 * Deliberately removes nothing, and this file exists to say so rather than to leave the
 * question open. What the plugin keeps in the database is the site's own configuration,
 * not the plugin's:
 *
 *   - silex_cave_trips holds the published trips' share links. Each is minted by a
 *     SilexGIS installation and is the whole of this site's claim to that trip; nothing
 *     here can mint one again, and a deletion would take the trips off the page until
 *     somebody obtained every link anew.
 *   - silex_cave_autolink holds the alias table, typed in by hand.
 *   - silex_ce_assets_base and silex_ce_caveview_home say where the code is on this
 *     server, silex_ce_label_scale how large the models write their station names, and
 *     silex_trips_generation is the counter the trips cache is keyed by.
 *   - each page's configuration is post meta (_silex_cave_embed_config), and belongs to
 *     the page as much as its text does.
 *
 * A reinstall must find all of it where it was. The only thing the plugin writes that is
 * not configuration is the trips cache, and transients lapse by themselves.
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;
