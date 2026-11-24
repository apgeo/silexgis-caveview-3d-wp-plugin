<?php
/**
 * The component's files, and the page recognition that decides who gets them.
 *
 * HOW A PAGE IS RECOGNISED
 *
 * By what its content contains, not by page id — so a preview, a duplicate, or a new cave
 * page works with no change here: the [silexgis_cave] shortcode, or the container's class
 * `cave_embed_model` written by hand in a raw-HTML block.
 *
 * FOOTER, DELIBERATELY
 *
 * Several modules reach for their markup as they parse rather than waiting for the
 * document, so they must run after the page's markup exists. In the footer they do, and
 * they still run before DOMContentLoaded, so modules that wait for it are unaffected.
 *
 * WHERE THE FILES ARE
 *
 * The plugin ships both halves: the component (assets/) and a build of the CaveView fork the
 * component is written against (vendor/caveview/<version>/). Each can be replaced by a
 * directory on the site, named on Settings → 3D models — a newer viewer build uploaded ahead
 * of a plugin release, or a component under development. Such a directory is a path from
 * the root of the host (it begins with "/"), and is read from the disk under ABSPATH to
 * version its files, so the override presumes WordPress is installed at the root of its
 * host; the copies the plugin ships have no such limit.
 */

defined( 'ABSPATH' ) || exit;

/**
 * A usable directory path: absolute, directory-shaped (ends in a slash), no whitespace, no
 * empty or parent-directory segments. It is joined onto ABSPATH to stat files, which is
 * why ".." is refused rather than merely discouraged.
 */
function silex_ce_is_base_path( $value ) {
	return is_string( $value )
		&& 1 === preg_match( '#^/(?:[^\s/]+/)*$#', $value )
		&& 0 === preg_match( '#/\.\.?/#', $value );
}

/** An override directory from the settings, or '' for the copy the plugin ships. */
function silex_ce_base_path_option( $name ) {
	$value = get_option( $name, '' );

	return silex_ce_is_base_path( $value ) ? $value : '';
}

/** The component directory the settings name, or '' for the plugin's own assets/. */
function silex_ce_assets_base() {
	return silex_ce_base_path_option( SILEX_CE_OPTION_ASSETS_BASE );
}

/** The CaveView build directory the settings name, or '' for the build the plugin ships. */
function silex_ce_caveview_base() {
	return silex_ce_base_path_option( SILEX_CE_OPTION_CAVEVIEW_HOME );
}

/** The plugin's own URL for a file it ships, as a path on this host (no scheme, no host). */
function silex_ce_plugin_path( $relative ) {
	return wp_make_link_relative( plugins_url( $relative, SILEX_CE_FILE ) );
}

/**
 * One file of the component, by its name under the component directory ("js/cave-embed.js"):
 * the address a page loads it from and the file on the disk that versions it.
 */
function silex_ce_component_file( $relative ) {
	$base = silex_ce_assets_base();
	if ( '' !== $base ) {
		return array(
			'url'  => $base . $relative,
			'file' => untrailingslashit( ABSPATH ) . $base . $relative,
		);
	}

	return array(
		'url'  => silex_ce_plugin_path( 'assets/' . $relative ),
		'file' => SILEX_CE_DIR . '/assets/' . $relative,
	);
}

/** The viewer build the pages load, and the `home` every page is told: a path on this host, ending in "/". */
function silex_ce_caveview_home() {
	$base = silex_ce_caveview_base();

	return '' !== $base ? $base : trailingslashit( silex_ce_plugin_path( 'vendor/caveview/' . SILEX_CE_CAVEVIEW_BUILD ) );
}

/** The viewer's script, as silex_ce_component_file() gives a component file. */
function silex_ce_caveview_script() {
	$base = silex_ce_caveview_base();
	if ( '' !== $base ) {
		return array(
			'url'  => $base . 'js/CaveView2.min.js',
			'file' => untrailingslashit( ABSPATH ) . $base . 'js/CaveView2.min.js',
		);
	}

	return array(
		'url'  => silex_ce_plugin_path( 'vendor/caveview/' . SILEX_CE_CAVEVIEW_BUILD . '/js/CaveView2.min.js' ),
		'file' => SILEX_CE_DIR . '/vendor/caveview/' . SILEX_CE_CAVEVIEW_BUILD . '/js/CaveView2.min.js',
	);
}

/**
 * Where a page's configuration file is looked for, `<name>.js`: `pages/` in the component
 * directory the settings name, or, with the plugin's own component, a directory under the
 * uploads — never inside the plugin, which an update replaces whole.
 */
function silex_ce_pages_dir() {
	$base = silex_ce_assets_base();
	if ( '' !== $base ) {
		return array(
			'url'  => $base . 'pages/',
			'file' => untrailingslashit( ABSPATH ) . $base . 'pages/',
		);
	}
	$uploads = wp_upload_dir( null, false );

	return array(
		'url'  => trailingslashit( wp_make_link_relative( $uploads['baseurl'] ) ) . SILEX_CE_UPLOADS_DIR . '/pages/',
		'file' => $uploads['basedir'] . '/' . SILEX_CE_UPLOADS_DIR . '/pages/',
	);
}

/**
 * The stored size of the survey's writing as a number within its bounds, or the default
 * where what is stored is not one: the value goes into a script, and a number that was read
 * as a number is the only thing that may.
 */
function silex_ce_label_scale() {
	$stored = get_option( SILEX_CE_OPTION_LABEL_SCALE, SILEX_CE_DEFAULT_LABEL_SCALE );
	if ( ! is_numeric( $stored ) ) {
		return (float) SILEX_CE_DEFAULT_LABEL_SCALE;
	}
	$scale = (float) $stored;

	return ( $scale >= SILEX_CE_LABEL_SCALE_MIN && $scale <= SILEX_CE_LABEL_SCALE_MAX ) ? $scale : (float) SILEX_CE_DEFAULT_LABEL_SCALE;
}

/**
 * A size as it is written into an attribute or stored: with a point, whatever the server's
 * locale says of decimals — PHP before 8 writes a float in the locale's own way, and a
 * comma in a number field or in a stored option is not a number to the next reader.
 */
function silex_ce_number( $number ) {
	$text = rtrim( rtrim( number_format( (float) $number, 2, '.', '' ), '0' ), '.' );

	return '' === $text ? '0' : $text;
}

/**
 * What the settings screen holds for the pages' language: a code of SILEX_CE_LANGUAGES, or
 * SILEX_CE_LANGUAGE_AUTO. A stored value that is neither counts as the default, which is the latter.
 */
function silex_ce_language_setting() {
	$value = (string) get_option( SILEX_CE_OPTION_LANGUAGE, SILEX_CE_LANGUAGE_AUTO );
	return array_key_exists( $value, SILEX_CE_LANGUAGES ) ? $value : SILEX_CE_LANGUAGE_AUTO;
}

/**
 * The site's own language as the pages can speak it: the first two letters of the site's locale
 * (Settings → General, not the visiting user's) where the component offers that language, and
 * English where it does not.
 */
function silex_ce_site_language() {
	$code = strtolower( substr( (string) get_locale(), 0, 2 ) );
	return array_key_exists( $code, SILEX_CE_LANGUAGES ) ? $code : 'en';
}

/** The language pages with a model open in: always a code of SILEX_CE_LANGUAGES, never "auto". */
function silex_ce_language() {
	$value = silex_ce_language_setting();
	return SILEX_CE_LANGUAGE_AUTO === $value ? silex_ce_site_language() : $value;
}

/**
 * What the site's settings say to every model on a page, printed before the component: the
 * component reads it once as it is given a page's configuration, and the configuration wins
 * where both speak.
 */
function silex_ce_site_settings_script() {
	return 'window.SilexCaveEmbedSite = ' . wp_json_encode( array(
		// The viewer build this site serves; a page's own `home` comes over it.
		'home'        => silex_ce_caveview_home(),
		'labelScale'  => silex_ce_label_scale(),
		// The language every page opens in unless it says another; a reader's own choice,
		// made on the page, comes over both.
		'language'    => silex_ce_language(),
		// The root of this site's routes, which a page's trips source asks trips/<slot>… under, so a page names only its slots.
		'tripsBase'   => wp_make_link_relative( rest_url( SILEX_CE_REST_NAMESPACE . '/' ) ),
		// The site's copy of each cave's finished trips, and whether a page drawn from it says so.
		'tripBundles' => (object) ( function_exists( 'silex_ce_bundle_for_pages' ) ? silex_ce_bundle_for_pages() : array() ),
		// The data sets a page may name with `data: { group }`: the site's copy of each cave, or the
		// installation as it is asked when no copy is kept, and the sets imported from archives.
		'datasets'    => (object) ( function_exists( 'silex_ce_datasets_for_pages' ) ? silex_ce_datasets_for_pages() : array() ),
		'cacheNotice' => function_exists( 'silex_ce_cache_notice' ) ? silex_ce_cache_notice() : true,
	), JSON_HEX_TAG | JSON_UNESCAPED_SLASHES ) . ';';
}

/**
 * The asset sets. There is one — a page with one or more models driven by SilexCaveEmbed — and
 * it is kept as a table because the Deactivate question counts pages by the same markers the
 * enqueue hook reads, and the two must not come to disagree.
 */
function silex_ce_asset_sets() {
	return array(
		'cave-embed' => array(
			'marker'    => 'cave_embed_model',
			'shortcode' => SILEX_CE_SHORTCODE,
			'styles'    => array( silex_ce_component_file( 'css/cave-embed.css' ) ),
			'scripts'   => array(
				'viewer'   => silex_ce_caveview_script(),
				'lightbox' => silex_ce_component_file( 'js/lightbox.js' ),
				'autolink' => silex_ce_component_file( 'js/text-autolink.js' ),
				'embed'    => silex_ce_component_file( 'js/cave-embed.js' ),
				// Where a party was at a given instant is one rule with one home, and that
				// home is the installation that publishes the trip. This is that rule,
				// built as a plain script from the same source the SilexGIS application
				// uses, so the two cannot come to disagree about who may be drawn.
				'fold'     => silex_ce_component_file( 'js/silexgis-trips.js' ),
				'trips'    => silex_ce_component_file( 'js/cave-trips.js' ),
			),
			// The site's settings and the alias table, printed just before the component.
			'inline_before' => 'embed',
			// A configuration held in post meta is printed as a SilexCaveEmbed.create()
			// call right after the component — or after the trips module when the
			// configuration has a trips section, because create() looks for that module
			// at the moment it is called and the module only announces itself as it loads.
			'create_after'  => array( 'default' => 'embed', 'trips' => 'trips' ),
		),
	);
}

/**
 * Whether this content wants the given set.
 *
 * A page whose content loads a CaveView build itself (a script ending in CaveView2.js or
 * CaveView2.min.js) owns its viewer, and is left entirely alone even when its markup looks
 * like ours: a second viewer stack injected beside its own breaks both. Hand-built model pages
 * made from a shared template are exactly such pages.
 */
function silex_ce_set_wants( $set, $content ) {
	if ( preg_match( '#CaveView2(?:\.min)?\.js#', $content ) ) {
		return false;
	}
	if ( false !== strpos( $content, $set['marker'] ) ) {
		return true;
	}

	return ! empty( $set['shortcode'] ) && has_shortcode( $content, $set['shortcode'] );
}

/** Whether the page being shown carries a model — for a theme or a site snippet that lays such pages out differently. */
function silex_ce_page_has_model( $post = null ) {
	$post = get_post( $post );
	if ( ! $post instanceof WP_Post ) {
		return false;
	}
	foreach ( silex_ce_asset_sets() as $set ) {
		if ( silex_ce_set_wants( $set, $post->post_content ) ) {
			return true;
		}
	}

	return false;
}

/**
 * A cache-busting version: the file's modification time, so a redeployed asset is picked
 * up rather than served from a browser cache until it happens to expire.
 */
function silex_ce_asset_version( $file ) {
	$time = @filemtime( $file );

	return $time ? (string) $time : SILEX_CE_VERSION;
}

/* ---------------------------------------------------------------------------------- */

/*
 * A page built around a model often wants the width a sidebar would take. Themes say how
 * through body classes, each its own way, so the plugin swaps nothing by itself: a site
 * hands it the pairs through the filter, e.g. for a theme whose sidebar is switched by class —
 *
 *   add_filter( 'silex_ce_body_class_swap', function () {
 *       return array( 'visible-sidebar-right' => 'invisible-sidebar-right' );
 *   } );
 */
add_filter( 'body_class', function ( $classes ) {
	if ( ! is_singular() ) {
		return $classes;
	}
	$swap = apply_filters( 'silex_ce_body_class_swap', array() );
	if ( ! is_array( $swap ) || ! $swap || ! silex_ce_page_has_model() ) {
		return $classes;
	}
	foreach ( $swap as $from => $to ) {
		$at = array_search( (string) $from, $classes, true );
		if ( false !== $at ) {
			$classes[ $at ] = sanitize_html_class( (string) $to );
		}
	}

	return $classes;
}, 20 );

add_action( 'wp_enqueue_scripts', function () {
	if ( ! is_singular() ) {
		return;
	}
	$post = get_post();
	if ( ! $post instanceof WP_Post ) {
		return;
	}

	$content = $post->post_content;
	$n       = 0;

	foreach ( silex_ce_asset_sets() as $name => $set ) {
		if ( ! silex_ce_set_wants( $set, $content ) ) {
			continue;
		}

		foreach ( $set['styles'] as $style ) {
			wp_enqueue_style( 'silex-' . $name . '-' . $n ++, $style['url'], array(), silex_ce_asset_version( $style['file'] ) );
		}

		$scripts = $set['scripts'];
		$config  = null;    // the configuration to print, if post meta is how it is configured
		$warn    = '';      // what a developer should be told when the page ends up configured by nothing

		// Per-page initialisation, in this order of precedence:
		//   1. the shortcode's config attribute names a file explicitly (and survives a
		//      slug rename), and wins whenever it is present;
		//   2. the page's own configuration in post meta, printed as a create() call;
		//   3. a file named after the page's slug.
		// A configuration channel that fails silently is a page that renders empty
		// containers with nothing anywhere saying why, so each way of ending up with
		// nothing leaves a message where a developer will look.
		$explicit = preg_match( '/\[' . SILEX_CE_SHORTCODE . '\b[^\]]*\bconfig="([A-Za-z0-9_-]+)"/', $content, $m ) ? $m[1] : '';
		$stored   = $explicit ? null : silex_ce_page_config( $post->ID );

		// What is stored is judged again here, whoever stored it and however: the save
		// refuses a configuration whose addresses leave this site, but a row written
		// straight into the database never passed through the save, and this is the
		// last place before the configuration becomes requests in a reader's browser.
		$refused = is_object( $stored ) ? silex_ce_config_address_faults( $stored ) : array();

		if ( is_object( $stored ) && ! $refused ) {
			$config = $stored;
		} else {
			if ( false === $stored ) {
				$warn .= SILEX_CE_SLUG . ': the configuration stored on this page (' . SILEX_CE_META_KEY
					. ') is not valid JSON and was ignored; open the page in the editor to correct it. ';
			}
			if ( $refused ) {
				$warn .= SILEX_CE_SLUG . ': the configuration stored on this page (' . SILEX_CE_META_KEY
					. ') was not printed, because ' . silex_ce_config_fault_console( $refused )
					. '; open the page in the editor to correct it. ';
			}
			$pages = silex_ce_pages_dir();
			$key   = $explicit ? $explicit : $post->post_name;
			if ( $key && preg_match( '/^[A-Za-z0-9_-]+$/D', (string) $key ) && file_exists( $pages['file'] . $key . '.js' ) ) {
				$scripts['page'] = array( 'url' => $pages['url'] . $key . '.js', 'file' => $pages['file'] . $key . '.js' );
			} else {
				$warn .= SILEX_CE_SLUG . ': no per-page configuration found at '
					. $pages['url'] . ( $key ? $key : '<empty slug>' ) . '.js'
					. ' — the model container will stay empty. Paste the configuration into the page\'s '
					. '"3D model (SilexCaveEmbed)" box, create that file, or set config="..." on the ['
					. SILEX_CE_SHORTCODE . '] shortcode.';
			}
		}

		// Each script depends on the previous one so WordPress cannot reorder them. The
		// viewer gets one fixed handle, so another plugin or theme that registers the
		// same handle is loaded once, not twice.
		$previous = false;
		$last     = null;
		$handles  = array();   // role => handle, for attaching inline code

		foreach ( $scripts as $role => $script ) {
			$handle = 'viewer' === $role ? 'silex-caveview2' : 'silex-' . $name . '-' . $role;
			wp_enqueue_script( $handle, $script['url'], $previous ? array( $previous ) : array(),
				silex_ce_asset_version( $script['file'] ), true );

			// wp_add_inline_script( ..., 'before' ) attaches to a handle, so the data has to
			// be added as the script it belongs to is enqueued rather than afterwards.
			if ( $role === $set['inline_before'] ) {
				wp_add_inline_script( $handle, silex_ce_site_settings_script(), 'before' );
				if ( function_exists( 'silex_autolink_inline_script' ) ) {
					wp_add_inline_script( $handle, silex_autolink_inline_script(), 'before' );
				}
			}

			$handles[ $role ] = $handle;
			$previous         = $handle;
			$last             = $handle;
		}

		if ( $config ) {
			$after = ( ! empty( $config->trips ) && isset( $handles[ $set['create_after']['trips'] ] ) )
				? $handles[ $set['create_after']['trips'] ]
				: ( isset( $handles[ $set['create_after']['default'] ] ) ? $handles[ $set['create_after']['default'] ] : $last );
			wp_add_inline_script( $after, silex_ce_create_script( $config ), 'after' );
		}

		// The warning quotes text from the database: the keys a stored configuration was
		// refused for, and the slug. It is encoded as the create() call is, with "<" and
		// ">" as escape sequences, because a "<!--" followed by a "<script" inside a script
		// element makes the parser read past the element's own closing tag, and everything
		// printed after it on the page becomes script text. The console shows the same words.
		if ( $warn && $last ) {
			wp_add_inline_script( $last, 'console.warn(' . wp_json_encode( trim( $warn ), JSON_HEX_TAG ) . ');' );
		}
	}
}, 20 );
