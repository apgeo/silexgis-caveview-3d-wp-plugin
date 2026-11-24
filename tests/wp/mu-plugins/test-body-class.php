<?php
// The body-class filter, as a site would use it: on a page with a model, "page" becomes
// "silex-wide-page". The check reads the class on a page with a model and on one without.
add_filter( 'silex_ce_body_class_swap', function () {
	return array( 'page' => 'silex-wide-page' );
} );
