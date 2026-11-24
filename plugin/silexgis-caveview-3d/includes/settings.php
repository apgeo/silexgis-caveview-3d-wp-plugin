<?php
/**
 * Settings → 3D models: how the models look, the site's copy of each cave, the data sets, and
 * where the code is — the copies the plugin ships, or a directory on the site named instead —
 * with links to the two other screens: the alias table for automatic place links, and the
 * published trips' links.
 */

defined( 'ABSPATH' ) || exit;

add_action( 'admin_menu', function () {
	add_options_page(
		__( '3D models', 'silexgis-caveview-3d' ),
		__( '3D models', 'silexgis-caveview-3d' ),
		'manage_options',
		'silexgis-caveview-3d',
		'silex_ce_settings_screen'
	);
} );

add_action( 'admin_init', function () {
	register_setting( 'silex_ce', SILEX_CE_OPTION_ASSETS_BASE, array(
		'type'              => 'string',
		'default'           => '',
		'sanitize_callback' => function ( $value ) {
			return silex_ce_sanitize_base_path( $value, SILEX_CE_OPTION_ASSETS_BASE, SILEX_CE_WITNESS_ASSETS_BASE );
		},
	) );
	register_setting( 'silex_ce', SILEX_CE_OPTION_CAVEVIEW_HOME, array(
		'type'              => 'string',
		'default'           => '',
		'sanitize_callback' => function ( $value ) {
			return silex_ce_sanitize_base_path( $value, SILEX_CE_OPTION_CAVEVIEW_HOME, SILEX_CE_WITNESS_CAVEVIEW_HOME );
		},
	) );

	register_setting( 'silex_ce', SILEX_CE_OPTION_LABEL_SCALE, array(
		'type'              => 'string',
		'default'           => SILEX_CE_DEFAULT_LABEL_SCALE,
		'sanitize_callback' => 'silex_ce_sanitize_label_scale',
	) );

	register_setting( 'silex_ce', SILEX_CE_OPTION_LANGUAGE, array(
		'type'              => 'string',
		'default'           => SILEX_CE_LANGUAGE_AUTO,
		// A language the pages offer, or "the site's"; anything else is the default.
		'sanitize_callback' => function ( $value ) {
			$value = (string) $value;
			return ( SILEX_CE_LANGUAGE_AUTO === $value || array_key_exists( $value, SILEX_CE_LANGUAGES ) ) ? $value : SILEX_CE_LANGUAGE_AUTO;
		},
	) );

	add_settings_section( 'silex_ce_look', __( 'How the model looks', 'silexgis-caveview-3d' ), '__return_false', 'silexgis-caveview-3d' );

	add_settings_field( SILEX_CE_OPTION_LANGUAGE, __( 'Default language of the pages', 'silexgis-caveview-3d' ), function () {
		$chosen = silex_ce_language_setting();
		?>
		<select name="<?php echo esc_attr( SILEX_CE_OPTION_LANGUAGE ); ?>" id="<?php echo esc_attr( SILEX_CE_OPTION_LANGUAGE ); ?>">
			<option value="<?php echo esc_attr( SILEX_CE_LANGUAGE_AUTO ); ?>" <?php selected( $chosen, SILEX_CE_LANGUAGE_AUTO ); ?>><?php
				/* translators: %s: the language "the site's language" comes to on this site now, e.g. "English" */
				echo esc_html( sprintf( __( 'The site\'s language (now %s)', 'silexgis-caveview-3d' ), SILEX_CE_LANGUAGES[ silex_ce_site_language() ] ) );
			?></option>
			<?php foreach ( SILEX_CE_LANGUAGES as $code => $name ) : ?>
				<option value="<?php echo esc_attr( $code ); ?>" <?php selected( $chosen, $code ); ?>><?php echo esc_html( $name ); ?></option>
			<?php endforeach; ?>
		</select>
		<p class="description"><?php esc_html_e( 'The language a page with a model opens in — its buttons, lists, figures and journal — when the page names no other in its configuration. A reader can choose another language on the page, with the small buttons at the end of the row of switches; their choice is kept in their browser.', 'silexgis-caveview-3d' ); ?></p>
		<p class="description"><?php
			/* translators: %s: the languages the pages offer, e.g. "Română, English" */
			echo esc_html( sprintf( __( '“The site\'s language” is the Site Language set under Settings → General when the pages offer it (%s), and English otherwise.', 'silexgis-caveview-3d' ), implode( ', ', SILEX_CE_LANGUAGES ) ) );
		?></p>
		<?php
	}, 'silexgis-caveview-3d', 'silex_ce_look' );

	add_settings_field( SILEX_CE_OPTION_LABEL_SCALE, __( 'Size of station names', 'silexgis-caveview-3d' ), function () {
		?>
		<input type="number" class="small-text" name="<?php echo esc_attr( SILEX_CE_OPTION_LABEL_SCALE ); ?>" id="<?php echo esc_attr( SILEX_CE_OPTION_LABEL_SCALE ); ?>"
			value="<?php echo esc_attr( silex_ce_number( silex_ce_label_scale() ) ); ?>" min="<?php echo esc_attr( SILEX_CE_LABEL_SCALE_MIN ); ?>" max="<?php echo esc_attr( SILEX_CE_LABEL_SCALE_MAX ); ?>" step="0.05">
		<p class="description"><?php esc_html_e( 'How large the model writes the names of its stations and their comments, as a part of the viewer\'s own size: 1 is its size, 0.6 six tenths of it. It applies to every page with a model; a page whose configuration says “labelScale” keeps its own value. On very dense screens the writing never shrinks below what can still be read.', 'silexgis-caveview-3d' ); ?></p>
		<?php
	}, 'silexgis-caveview-3d', 'silex_ce_look' );

	register_setting( 'silex_ce', SILEX_CE_OPTION_CACHE_NOTICE, array(
		'type'              => 'string',
		'default'           => '1',
		// A box that is not ticked is not sent at all, so an absent value is "off".
		'sanitize_callback' => function ( $value ) {
			return '1' === (string) $value ? '1' : '0';
		},
	) );

	register_setting( 'silex_ce', SILEX_CE_OPTION_KEEP_COPY, array(
		'type'              => 'string',
		'default'           => '1',
		// A box that is not ticked is not sent at all, so an absent value is "off".
		'sanitize_callback' => function ( $value ) {
			return '1' === (string) $value ? '1' : '0';
		},
	) );

	add_settings_section( 'silex_ce_copy', __( 'The site\'s copy of the trips', 'silexgis-caveview-3d' ), 'silex_ce_bundle_section', 'silexgis-caveview-3d' );

	add_settings_field( SILEX_CE_OPTION_KEEP_COPY, __( 'Keep a copy of the installation\'s data on this site', 'silexgis-caveview-3d' ), function () {
		?>
		<label>
			<input type="checkbox" name="<?php echo esc_attr( SILEX_CE_OPTION_KEEP_COPY ); ?>" id="<?php echo esc_attr( SILEX_CE_OPTION_KEEP_COPY ); ?>" value="1" <?php checked( silex_ce_keep_copy() ); ?> />
			<?php esc_html_e( 'Write the trips and the cave — the survey file, the named places, the photographs — to this site every five minutes, and draw the pages from that copy.', 'silexgis-caveview-3d' ); ?>
		</label>
		<p class="description" style="max-width:52em"><?php esc_html_e( 'Switched off, no copy is written and the one already on the server is left as it is but no longer used: the pages read the trips from the installation through this site as they are asked, and the cave through this site\'s own addresses, which ask the installation in turn. Nothing of the cave or its trips is then shown while the installation is not answering.', 'silexgis-caveview-3d' ); ?></p>
		<?php
	}, 'silexgis-caveview-3d', 'silex_ce_copy' );

	add_settings_field( SILEX_CE_OPTION_CACHE_NOTICE, __( 'A note when a page is drawn from the copy', 'silexgis-caveview-3d' ), function () {
		?>
		<label>
			<input type="checkbox" name="<?php echo esc_attr( SILEX_CE_OPTION_CACHE_NOTICE ); ?>" id="<?php echo esc_attr( SILEX_CE_OPTION_CACHE_NOTICE ); ?>" value="1" <?php checked( silex_ce_cache_notice() ); ?> />
			<?php esc_html_e( 'Say on the page, in one small line, when the SilexGIS installation is not answering and the trips are shown from the site\'s copy, and how old the copy is.', 'silexgis-caveview-3d' ); ?>
		</label>
		<?php
	}, 'silexgis-caveview-3d', 'silex_ce_copy' );

	add_settings_section( 'silex_ce_paths', __( 'Where the code is', 'silexgis-caveview-3d' ), function () {
		echo '<p>' . esc_html__( 'Left empty, a field means the copy the plugin ships, which is updated with the plugin. A directory named instead is a path from the root of the site, begins and ends with “/” and contains no spaces; it is read from the disk under the WordPress directory, so it serves only a WordPress installed at the root of its host. A value that does not look like that is refused, and the one before it stays. So is a path where the code is not on the server: the files go there first, then the path is changed.', 'silexgis-caveview-3d' ) . '</p>';
	}, 'silexgis-caveview-3d' );

	add_settings_field( SILEX_CE_OPTION_ASSETS_BASE, __( 'Components directory', 'silexgis-caveview-3d' ), function () {
		silex_ce_path_field( SILEX_CE_OPTION_ASSETS_BASE, silex_ce_assets_base(), SILEX_CE_WITNESS_ASSETS_BASE,
			__( 'The component, with css/, js/ and pages/ (the pages\' configuration files). Empty: the plugin\'s own, with the pages\' files under the uploads directory.', 'silexgis-caveview-3d' ),
			silex_ce_plugin_path( 'assets/' ) );
	}, 'silexgis-caveview-3d', 'silex_ce_paths' );

	add_settings_field( SILEX_CE_OPTION_CAVEVIEW_HOME, __( 'CaveView directory', 'silexgis-caveview-3d' ), function () {
		silex_ce_path_field( SILEX_CE_OPTION_CAVEVIEW_HOME, silex_ce_caveview_base(), SILEX_CE_WITNESS_CAVEVIEW_HOME,
			/* translators: %s: the version of the viewer build the plugin ships */
			sprintf( __( 'A build of the CaveView.js fork the component is written against. Empty: the build the plugin ships, %s.', 'silexgis-caveview-3d' ), SILEX_CE_CAVEVIEW_BUILD ),
			trailingslashit( silex_ce_plugin_path( 'vendor/caveview/' . SILEX_CE_CAVEVIEW_BUILD ) ) );
	}, 'silexgis-caveview-3d', 'silex_ce_paths' );
} );

/**
 * The file that proves each path: if it is there, the code is. The screen shows whether
 * it is, and a save is refused when it is not.
 */
define( 'SILEX_CE_WITNESS_ASSETS_BASE', 'js/cave-embed.js' );
define( 'SILEX_CE_WITNESS_CAVEVIEW_HOME', 'js/CaveView2.min.js' );

/**
 * A path as the settings screen accepts it: of the right shape (silex_ce_is_base_path())
 * and with its witness file on this server. A refused value keeps the stored one and says
 * why, in the screen's own notice area — which prints a message as it is given, so the
 * value somebody typed is escaped before it goes into one.
 *
 * The second condition is what keeps a slip of the keyboard off the public pages. Every
 * page with a model loads its scripts from these two directories, so a well-formed path
 * with nothing behind it — a mistyped name, or the next viewer build named before it was
 * uploaded — would leave all of them without their code for every reader until somebody
 * noticed. The files go up first; the path follows.
 */
function silex_ce_sanitize_base_path( $value, $option, $witness ) {
	$value    = is_string( $value ) ? trim( $value ) : '';
	$previous = silex_ce_base_path_option( $option );

	// Empty is the copy the plugin ships, and always there.
	if ( '' === $value ) {
		return '';
	}
	if ( ! silex_ce_is_base_path( $value ) ) {
		add_settings_error(
			$option,
			'silex_ce_base_path',
			/* translators: %s: the refused value */
			sprintf( __( 'The path “%s” was refused: it must begin and end with “/”, with no spaces and no “..”. The previous value was kept.', 'silexgis-caveview-3d' ), esc_html( $value ) )
		);

		return $previous;
	}
	// The value already stored is let through as it is: a save of the other field must
	// not be turned into an error about this one.
	if ( $value !== $previous && ! file_exists( untrailingslashit( ABSPATH ) . $value . $witness ) ) {
		add_settings_error(
			$option,
			'silex_ce_base_path_empty',
			/* translators: 1: the refused value, 2: the file that was looked for */
			sprintf( __( 'The path “%1$s” was refused: %2$s is not on the server, so the pages with a model would be left without their code. Put the files there first. The previous value was kept.', 'silexgis-caveview-3d' ), esc_html( $value ), esc_html( $value . $witness ) )
		);

		return $previous;
	}

	return $value;
}

/**
 * The size of the survey's writing as the settings screen accepts it: a number within the
 * bounds, written with a point or with a comma. Anything else keeps the stored value and
 * says why.
 */
function silex_ce_sanitize_label_scale( $value ) {
	$previous = silex_ce_number( silex_ce_label_scale() );
	$typed    = is_string( $value ) || is_numeric( $value ) ? str_replace( ',', '.', trim( (string) $value ) ) : '';

	if ( ! preg_match( '/^\d+(\.\d+)?\z/', $typed ) || (float) $typed < SILEX_CE_LABEL_SCALE_MIN || (float) $typed > SILEX_CE_LABEL_SCALE_MAX ) {
		add_settings_error(
			SILEX_CE_OPTION_LABEL_SCALE,
			'silex_ce_label_scale',
			/* translators: 1: the refused value, 2: the smallest value accepted, 3: the largest */
			sprintf( __( 'The size “%1$s” was refused: it must be a number between %2$s and %3$s. The previous value was kept.', 'silexgis-caveview-3d' ),
				esc_html( is_scalar( $value ) ? (string) $value : '' ), SILEX_CE_LABEL_SCALE_MIN, SILEX_CE_LABEL_SCALE_MAX )
		);

		return $previous;
	}

	return silex_ce_number( (float) $typed );
}

/** One path field, with whether the file that proves the path is there. Empty is the plugin's own copy, at $own. */
function silex_ce_path_field( $option, $value, $witness, $description, $own ) {
	$there = '' === $value || file_exists( untrailingslashit( ABSPATH ) . $value . $witness );
	?>
	<input type="text" class="regular-text code" name="<?php echo esc_attr( $option ); ?>" id="<?php echo esc_attr( $option ); ?>"
		value="<?php echo esc_attr( $value ); ?>" placeholder="<?php echo esc_attr( $own ); ?>" spellcheck="false">
	<p class="description"><?php echo esc_html( $description ); ?></p>
	<?php if ( '' === $value ) : ?>
		<p class="description"><span style="color:#00a32a">&#10003;</span>
		<?php
		/* translators: %s: the directory of the copy the plugin ships */
		printf( esc_html__( 'The plugin\'s own copy, %s.', 'silexgis-caveview-3d' ), '<code>' . esc_html( $own ) . '</code>' );
		?>
		</p>
		<?php return; ?>
	<?php endif; ?>
	<p class="description">
		<?php if ( $there ) : ?>
			<span style="color:#00a32a">&#10003;</span>
			<?php
			/* translators: %s: a file path */
			printf( esc_html__( '%s is on the server.', 'silexgis-caveview-3d' ), '<code>' . esc_html( $value . $witness ) . '</code>' );
			?>
		<?php else : ?>
			<span style="color:#d63638">&#10007;</span>
			<?php
			/* translators: %s: a file path */
			printf( esc_html__( '%s is not on the server: the pages with a model will stay empty until the code is put there or the path is corrected.', 'silexgis-caveview-3d' ), '<code>' . esc_html( $value . $witness ) . '</code>' );
			?>
		<?php endif; ?>
	</p>
	<?php
}

/**
 * What the site's copy of each cave's trips is, as the settings screen shows it: when it was last
 * written, whether the last try failed and why, and a button that writes it now.
 */
function silex_ce_bundle_section() {
	echo '<p style="max-width:52em">' . esc_html__( 'A page reads the finished trips from a file the site writes by itself from the SilexGIS installation every five minutes: a change made on the installation reaches the page within that time at most. When the installation does not answer, the file stays as it was and the page is shown from it.', 'silexgis-caveview-3d' ) . '</p>';
	if ( ! silex_ce_keep_copy() ) {
		echo '<p style="max-width:52em"><strong>' . esc_html__( 'The site keeps no copy at the moment: the pages read the installation as they are asked.', 'silexgis-caveview-3d' ) . '</strong></p>';
	}
	$states = silex_ce_bundle_states();
	$groups = silex_ce_bundle_groups();
	if ( ! $groups ) {
		echo '<p><em>' . esc_html__( 'There are no links to published trips yet, so there is no copy either.', 'silexgis-caveview-3d' ) . '</em></p>';
		return;
	}
	echo '<table class="widefat striped" style="max-width:52em"><thead><tr><th>' . esc_html__( 'Cave (group of links)', 'silexgis-caveview-3d' )
		. '</th><th>' . esc_html__( 'Last written', 'silexgis-caveview-3d' ) . '</th><th>' . esc_html__( 'Last try', 'silexgis-caveview-3d' )
		. '</th><th>' . esc_html__( 'Trips', 'silexgis-caveview-3d' ) . '</th><th>' . esc_html__( 'Cave', 'silexgis-caveview-3d' ) . '</th></tr></thead><tbody>';
	foreach ( $groups as $group ) {
		$s       = isset( $states[ $group ] ) ? $states[ $group ] : array();
		$written = empty( $s['writtenAt'] ) ? __( 'never', 'silexgis-caveview-3d' ) : get_date_from_gmt( str_replace( array( 'T', 'Z' ), ' ', $s['writtenAt'] ), 'Y-m-d H:i' );
		$tried   = empty( $s['checkedAt'] ) ? '—' : get_date_from_gmt( str_replace( array( 'T', 'Z' ), ' ', $s['checkedAt'] ), 'Y-m-d H:i' );
		if ( ! empty( $s['failure'] ) ) {
			/* translators: %s: what went wrong, e.g. "unreachable" or "HTTP 503" */
			$tried .= ' — ' . sprintf( __( 'failed: %s', 'silexgis-caveview-3d' ), $s['failure'] );
		}
		$count = isset( $s['tally']['trips'] ) ? (int) $s['tally']['trips'] : '—';
		// The cave written beside the trips: its survey file, and what the last writing did about it.
		$cave = empty( $s['caveWrittenAt'] ) ? __( 'not written', 'silexgis-caveview-3d' ) : ( empty( $s['survey'] ) ? __( 'written, with no survey file', 'silexgis-caveview-3d' ) : basename( (string) $s['survey'] ) );
		if ( ! empty( $s['tally']['surveyFetched'] ) ) {
			$cave .= ' — ' . __( 'survey fetched at the last writing', 'silexgis-caveview-3d' );
		} elseif ( ! empty( $s['tally']['surveyRefused'] ) ) {
			$cave .= ' — ' . __( 'the survey could not be fetched at the last writing', 'silexgis-caveview-3d' );
		}
		echo '<tr><td>' . esc_html( $group ) . '</td><td>' . esc_html( $written ) . '</td><td>' . esc_html( $tried ) . '</td><td>' . esc_html( $count ) . '</td><td>' . esc_html( $cave ) . '</td></tr>';
	}
	echo '</tbody></table>';
}

function silex_ce_settings_screen() {
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_die( esc_html__( 'You do not have the necessary permission.', 'silexgis-caveview-3d' ) );
	}
	?>
	<div class="wrap">
		<h1><?php esc_html_e( '3D models', 'silexgis-caveview-3d' ); ?></h1>

		<p style="max-width:52em">
			<?php esc_html_e( 'The plugin puts a cave\'s 3D model on a page, with its places, its photographs and its published trips. It loads the model\'s scripts and styles only on the pages that carry a model, and hands each page its configuration.', 'silexgis-caveview-3d' ); ?>
		</p>

		<?php if ( isset( $_GET['silex_ce_bundle'] ) && preg_match( '/^(\d+)-(\d+)$/', (string) $_GET['silex_ce_bundle'], $m ) ) : // phpcs:ignore WordPress.Security.NonceVerification ?>
			<div class="notice <?php echo $m[1] === $m[2] ? 'notice-success' : 'notice-warning'; ?>"><p>
				<?php
				/* translators: 1: copies written, 2: copies asked for */
				echo esc_html( sprintf( __( 'The copy of the trips: %1$s of %2$s written just now.', 'silexgis-caveview-3d' ), $m[1], $m[2] ) );
				?>
			</p></div>
		<?php endif; ?>

		<form action="options.php" method="post">
			<?php
			settings_fields( 'silex_ce' );
			do_settings_sections( 'silexgis-caveview-3d' );
			submit_button( __( 'Save', 'silexgis-caveview-3d' ) );
			?>
		</form>

		<?php if ( silex_ce_keep_copy() ) : ?>
			<form action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" method="post">
				<input type="hidden" name="action" value="silex_ce_bundle_refresh" />
				<?php wp_nonce_field( 'silex_ce_bundle_refresh' ); ?>
				<?php submit_button( __( 'Write the copy of the trips now', 'silexgis-caveview-3d' ), 'secondary', 'silex_ce_bundle_now', false ); ?>
			</form>
		<?php endif; ?>

		<?php silex_ce_datasets_section(); ?>

		<h2><?php esc_html_e( 'The other screens', 'silexgis-caveview-3d' ); ?></h2>
		<ul>
			<li>
				<a href="<?php echo esc_url( admin_url( 'options-general.php?page=silex-cave-autolink' ) ); ?>"><?php esc_html_e( 'Automatic links to the 3D model', 'silexgis-caveview-3d' ); ?></a>
				— <?php esc_html_e( 'the table of names that turns the names of places in the text into links to the model.', 'silexgis-caveview-3d' ); ?>
			</li>
			<li>
				<a href="<?php echo esc_url( admin_url( 'options-general.php?page=silex-cave-trips' ) ); ?>"><?php esc_html_e( 'Published trips (SilexGIS)', 'silexgis-caveview-3d' ); ?></a>
				— <?php esc_html_e( 'the installation\'s address and the published trips\' links, kept on the server and never in the page.', 'silexgis-caveview-3d' ); ?>
			</li>
		</ul>

		<h2><?php esc_html_e( 'How a page gets a model', 'silexgis-caveview-3d' ); ?></h2>
		<ol style="max-width:52em">
			<li><?php esc_html_e( 'The page\'s content carries the [silexgis_cave] shortcode, which puts the model\'s container on the page (with the attributes id, places, places_id, height, width, class, config; a caption is written between [silexgis_cave] and [/silexgis_cave]).', 'silexgis-caveview-3d' ); ?></li>
			<li><?php esc_html_e( 'The model\'s configuration — the cave, the places, the photographs, the trips — comes from one of three places, in this order: the file named by the shortcode\'s config="..." attribute; the “3D model (SilexCaveEmbed)” box on the page, holding the configuration as JSON; a file pages/<slug>.js, named after the page\'s address, in the pages\' directory (see “Where the code is”).', 'silexgis-caveview-3d' ); ?></li>
			<li><?php esc_html_e( 'The plugin loads the styles and scripts itself, at the foot of the page; the content must hold no script or link tag.', 'silexgis-caveview-3d' ); ?></li>
		</ol>
	</div>
	<?php
}

/* ---- data sets imported from archives ---------------------------------------------------- */

/** Why an archive was refused, for a person, by the reason silex_ce_dataset_import() gives. */
function silex_ce_dataset_refusal( $reason ) {
	switch ( $reason ) {
		case 'name':
			return __( 'the name may hold only small letters without diacritics, digits, “-” and “_”, must begin with a letter or a digit, and may be 40 characters long at most.', 'silexgis-caveview-3d' );
		case 'nozip':
			return __( 'this server\'s PHP cannot read zip archives (its zip extension is missing); the host can switch it on.', 'silexgis-caveview-3d' );
		case 'unreadable':
			return __( 'the file is not a zip archive that can be read.', 'silexgis-caveview-3d' );
		case 'entry':
			return __( 'the archive holds a file a data set may not hold: a path that leads out of the set or is more than two folders deep, or a kind of file other than JSON, a survey (.lox, .3d, .plt) or a picture (.jpg, .png, .webp).', 'silexgis-caveview-3d' );
		case 'size':
			/* translators: %s: a size, e.g. "200 MB" */
			return sprintf( __( 'the archive unpacks to more than %s.', 'silexgis-caveview-3d' ), size_format( SILEX_CE_DATASET_MAX_BYTES ) );
		case 'cave':
			return __( 'the archive has no cave.json of a data set\'s form at its root.', 'silexgis-caveview-3d' );
		case 'upload':
			/* translators: %s: a size, e.g. "8 MB" */
			return sprintf( __( 'no archive arrived: none was chosen, or it is larger than this server accepts (%s).', 'silexgis-caveview-3d' ), size_format( wp_max_upload_size() ) );
		default:
			return __( 'the data set could not be written on the server; the set of that name, if there was one, is as it was.', 'silexgis-caveview-3d' );
	}
}

/** The imported data sets, with a button to delete each, and the form that imports one. */
function silex_ce_datasets_section() {
	$said = isset( $_GET['silex_ce_dataset'] ) ? sanitize_key( wp_unslash( $_GET['silex_ce_dataset'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification
	$name = isset( $_GET['silex_ce_dataset_name'] ) ? (string) wp_unslash( $_GET['silex_ce_dataset_name'] ) : ''; // phpcs:ignore WordPress.Security.NonceVerification
	?>
	<h2 id="silex-ce-datasets"><?php esc_html_e( 'Data sets', 'silexgis-caveview-3d' ); ?></h2>
	<p style="max-width:52em">
		<?php
		printf(
			/* translators: 1: how a page names a data set in its configuration, 2: the files a data set holds */
			esc_html__( 'A data set is a cave and its trips as plain files — %2$s — which a page draws with no installation behind it, named in its configuration as %1$s. The site\'s copy of each installation\'s cave is one, under the name of its group of links; others are imported here, from a zip archive of such a directory. An imported set comes over the site\'s copy of the same name. A SilexGIS installation will later be able to export such an archive for a cave and its published trips.', 'silexgis-caveview-3d' ),
			'<code>data: { group: "…" }</code>',
			'<code>cave.json</code>, <code>trips.json</code>, <code>media/</code>'
		);
		?>
	</p>
	<?php if ( '' !== $said ) : ?>
		<?php
		$files = isset( $_GET['silex_ce_dataset_files'] ) ? (int) $_GET['silex_ce_dataset_files'] : 0; // phpcs:ignore WordPress.Security.NonceVerification
		if ( 'imported' === $said ) {
			$kind = 'success';
			/* translators: 1: the data set's name, 2: how many files it holds */
			$text = sprintf( _n( 'The data set “%1$s” was imported: %2$d file.', 'The data set “%1$s” was imported: %2$d files.', $files, 'silexgis-caveview-3d' ), $name, $files );
		} elseif ( 'deleted' === $said ) {
			$kind = 'success';
			/* translators: %s: the data set's name */
			$text = sprintf( __( 'The data set “%s” was deleted.', 'silexgis-caveview-3d' ), $name );
		} elseif ( 'notdeleted' === $said ) {
			$kind = 'error';
			/* translators: %s: the data set's name */
			$text = sprintf( __( 'The data set “%s” could not be deleted.', 'silexgis-caveview-3d' ), $name );
		} else {
			$kind = 'error';
			/* translators: %s: why the archive was refused */
			$text = sprintf( __( 'Nothing was imported, and nothing was changed: %s', 'silexgis-caveview-3d' ), silex_ce_dataset_refusal( $said ) );
		}
		?>
		<div class="notice notice-<?php echo esc_attr( $kind ); ?> inline silex-ce-dataset-notice"><p><?php echo esc_html( $text ); ?></p></div>
	<?php endif; ?>
	<?php $sets = silex_ce_datasets(); ?>
	<?php if ( ! $sets ) : ?>
		<p><em><?php esc_html_e( 'No data set has been imported.', 'silexgis-caveview-3d' ); ?></em></p>
	<?php else : ?>
		<table class="widefat striped" style="max-width:52em" id="silex-ce-datasets-table">
			<thead><tr>
				<th><?php esc_html_e( 'Name', 'silexgis-caveview-3d' ); ?></th>
				<th><?php esc_html_e( 'Files', 'silexgis-caveview-3d' ); ?></th>
				<th><?php esc_html_e( 'Imported', 'silexgis-caveview-3d' ); ?></th>
				<th></th>
			</tr></thead>
			<tbody>
			<?php foreach ( $sets as $set ) : ?>
				<?php
				$place = silex_ce_dataset_place( $set );
				$count = 0;
				foreach ( new RecursiveIteratorIterator( new RecursiveDirectoryIterator( $place['dir'], FilesystemIterator::SKIP_DOTS ) ) as $file ) {
					$count += $file->isFile() ? 1 : 0;
				}
				?>
				<tr data-dataset="<?php echo esc_attr( $set ); ?>">
					<td><code><?php echo esc_html( $set ); ?></code></td>
					<td><?php echo esc_html( $count ); ?></td>
					<td><?php echo esc_html( get_date_from_gmt( gmdate( 'Y-m-d H:i:s', (int) filemtime( $place['dir'] . '/cave.json' ) ), 'Y-m-d H:i' ) ); ?></td>
					<td>
						<form action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" method="post" style="margin:0">
							<input type="hidden" name="action" value="silex_ce_dataset_delete" />
							<input type="hidden" name="silex_ce_dataset_name" value="<?php echo esc_attr( $set ); ?>" />
							<?php wp_nonce_field( 'silex_ce_dataset_delete' ); ?>
							<button type="submit" class="button-link button-link-delete silex-ce-dataset-delete"
								onclick="return window.confirm(<?php
									/* translators: %s: the data set's name */
									echo esc_attr( wp_json_encode( sprintf( __( 'Delete the data set “%s”? Pages that name it will have no cave.', 'silexgis-caveview-3d' ), $set ) ) );
								?>);"><?php esc_html_e( 'Delete', 'silexgis-caveview-3d' ); ?></button>
						</form>
					</td>
				</tr>
			<?php endforeach; ?>
			</tbody>
		</table>
	<?php endif; ?>
	<form action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" method="post" enctype="multipart/form-data" id="silex-ce-dataset-import" style="margin-top:1em">
		<input type="hidden" name="action" value="silex_ce_dataset_import" />
		<?php wp_nonce_field( 'silex_ce_dataset_import' ); ?>
		<p>
			<label for="silex_ce_dataset_zip"><?php esc_html_e( 'Archive (.zip)', 'silexgis-caveview-3d' ); ?></label><br>
			<input type="file" name="silex_ce_dataset_zip" id="silex_ce_dataset_zip" accept=".zip,application/zip" />
		</p>
		<p>
			<label for="silex_ce_dataset_name"><?php esc_html_e( 'Name', 'silexgis-caveview-3d' ); ?></label><br>
			<input type="text" name="silex_ce_dataset_name" id="silex_ce_dataset_name" class="regular-text code" pattern="[a-z0-9][a-z0-9_\-]{0,39}" spellcheck="false" />
		</p>
		<p class="description" style="max-width:52em">
			<?php
			printf(
				/* translators: 1: the largest archive this server accepts, 2: the largest a set may unpack to */
				esc_html__( 'Small letters without diacritics, digits, “-” and “_”, at most 40 characters: the name pages use. An archive with the name of a set already here replaces it whole. This server accepts archives of up to %1$s, unpacking to %2$s at most.', 'silexgis-caveview-3d' ),
				esc_html( size_format( wp_max_upload_size() ) ),
				esc_html( size_format( SILEX_CE_DATASET_MAX_BYTES ) )
			);
			?>
		</p>
		<?php submit_button( __( 'Import the archive', 'silexgis-caveview-3d' ), 'secondary', 'silex_ce_dataset_import_now', false ); ?>
	</form>
	<?php
}

/** Back to the screen's data sets, saying what happened. */
function silex_ce_dataset_redirect( $said, $name, $files = 0 ) {
	wp_safe_redirect( add_query_arg( array(
		'page'                   => 'silexgis-caveview-3d',
		'silex_ce_dataset'       => $said,
		'silex_ce_dataset_name'  => rawurlencode( substr( (string) $name, 0, 80 ) ),
		'silex_ce_dataset_files' => (int) $files,
	), admin_url( 'options-general.php' ) ) . '#silex-ce-datasets' );
	exit;
}

add_action( 'admin_post_silex_ce_dataset_import', function () {
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_die( esc_html__( 'You are not allowed to do this.', 'silexgis-caveview-3d' ), 403 );
	}
	check_admin_referer( 'silex_ce_dataset_import' );
	$name = isset( $_POST['silex_ce_dataset_name'] ) ? trim( (string) wp_unslash( $_POST['silex_ce_dataset_name'] ) ) : '';
	$file = isset( $_FILES['silex_ce_dataset_zip'] ) && is_array( $_FILES['silex_ce_dataset_zip'] ) ? $_FILES['silex_ce_dataset_zip'] : null;
	// The name is judged before the upload, so that a refusal for it says so even with no file.
	if ( ! silex_ce_dataset_name_ok( $name ) ) {
		silex_ce_dataset_redirect( 'name', $name );
	}
	if ( ! $file || UPLOAD_ERR_OK !== (int) $file['error'] || ! is_uploaded_file( $file['tmp_name'] ) ) {
		silex_ce_dataset_redirect( 'upload', $name );
	}
	$done = silex_ce_dataset_import( $file['tmp_name'], $name );
	silex_ce_dataset_redirect( $done['ok'] ? 'imported' : (string) $done['reason'], $name, $done['files'] );
} );

add_action( 'admin_post_silex_ce_dataset_delete', function () {
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_die( esc_html__( 'You are not allowed to do this.', 'silexgis-caveview-3d' ), 403 );
	}
	check_admin_referer( 'silex_ce_dataset_delete' );
	$name = isset( $_POST['silex_ce_dataset_name'] ) ? (string) wp_unslash( $_POST['silex_ce_dataset_name'] ) : '';
	silex_ce_dataset_redirect( silex_ce_dataset_delete( $name ) ? 'deleted' : 'notdeleted', $name );
} );
