// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <http://www.gnu.org/licenses/>.

/**
 * Javascript to initialise the opencast block settings.
 *
 * @package    block_opencast
 * @copyright  2021 Tamara Gunkel, University of Münster
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

import Tabulator from 'block_opencast/tabulator';
import $ from 'jquery';
import * as str from 'core/str';
import ModalFactory from 'core/modal_factory';
import ModalEvents from 'core/modal_events';
import Fragment from 'core/fragment';
import Ajax from 'core/ajax';

function getBody(contextid, formdata) {
    if (typeof formdata === 'undefined') {
        formdata = {};
    }

    var params = {jsonformdata: JSON.stringify(formdata)};
    return Fragment.loadFragment('block_opencast', 'series_form', contextid, params);
}

function submitFormAjax(e) {
    e.preventDefault();
    var modal = e.data.modal;
    var contextid = e.data.contextid;
    var seriestable = e.data.seriestable;

    var changeEvent = document.createEvent('HTMLEvents');
    changeEvent.initEvent('change', true, true);

    // Run validation functions.
    modal.getRoot().find(':input').each(function (index, element) {
        element.dispatchEvent(changeEvent);
    });

    // Check if there are invalid fields.
    var invalid = $.merge(
        modal.getRoot().find('[aria-invalid="true"]'),
        modal.getRoot().find('.error')
    );

    if (invalid.length) {
        invalid.first().focus();
        return;
    }

    // Convert all the form elements values to a serialised string.
    var formData = modal.getRoot().find('form').serialize();

    // Submit form.
    Ajax.call([{
        methodname: 'block_opencast_submit_series_form',
        args: {contextid: contextid, jsonformdata: JSON.stringify(formData)},
        done: function (newseries) {
            modal.hide();
            if(seriestable !== undefined) {
                var s = JSON.parse(newseries);
                seriestable.addRow({'seriesname': s.seriestitle, 'series':s.series, 'isdefault': s.isdefault});
            }
        },
        fail: function () {
            modal.setBody(getBody(contextid, formData));
        }
    }]);
}

function loadSeriesTitles(contextid, series, seriestable, row) {
    Ajax.call([{
        methodname: 'block_opencast_get_series_titles',
        args: {contextid: contextid, series: JSON.stringify(series)},
        done: function (data) {
            var titles = JSON.parse(data);
            if (seriestable !== null) {
                seriestable.getRows().forEach(function (row) {
                    row.update({"seriesname": titles[row.getData().series]});
                });
            } else {
                row.update({"seriesname": titles[row.getData().series]});
            }

        },
        fail: function (error) {
            // TOdo handle this.
            window.console.log(error);
        }
    }]);
}

export const init = (contextid, seriesinputname) => {

    // Load strings
    var strings = [
        {key: 'seriesname', component: 'block_opencast'},
        {key: 'form_seriesid', component: 'block_opencast'},
        {key: 'default', component: 'block_opencast'},
        {key: 'noconnectedseries', component: 'block_opencast'},
        {key: 'createseriesforcourse', component: 'block_opencast'},
        {key: 'delete_series', component: 'block_opencast'},
        {key: 'delete_confirm_series', component: 'block_opencast'},
        {key: 'editseries', component: 'block_opencast'},
        {key: 'heading_datatype', component: 'block_opencast'},// todo delete unused strings
        {key: 'heading_required', component: 'block_opencast'},
        {key: 'heading_readonly', component: 'block_opencast'},
        {key: 'heading_params', component: 'block_opencast'},
        {key: 'delete', component: 'moodle'}
    ];
    str.get_strings(strings).then(function (jsstrings) {
        // Style hidden input.
        var seriesinput = $('input[name="' + seriesinputname + '"]');

        // TODO also update series name if id was changed

        var seriestable = new Tabulator("#seriestable", {
            data: JSON.parse(seriesinput.val()),
            layout: "fitColumns",
            placeholder: jsstrings[3],
            headerSort: false,
            dataChanged: function (data) {
                // Remove empty rows.
                data = data.filter(value => value.series);
                data = data.reduce((function (arr, x) {
                    arr[x.series] = x.isdefault;
                    return arr;
                }), {});
                seriesinput.val(JSON.stringify(data));
            },
            dataLoaded: function (data) {
                // Load series titles.
                loadSeriesTitles(contextid, data.map(x => x['series']), this);
            },
            columns: [
                {title: jsstrings[0], field: "seriesname", editable: false},
                {
                    title: jsstrings[1], field: "series", editor: 'input', cellEdited: function (cell) {
                        // Check if it matches Opencast series id regex.
                        var r = /^[a-z0-9]{8}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{12}$/;
                        if (r.test(cell.getValue())) {
                            cell.getRow().update({"seriesname": "Loading..."}); // todo durch string erseztnen?
                            loadSeriesTitles(contextid, [cell.getValue()], null, cell.getRow());
                        }
                        else {
                            cell.getRow().update({"seriesname": ""});
                        }
                    }
                },
                {
                    title: jsstrings[2], field: "isdefault",
                    hozAlign: "center",
                    widthGrow: 0,
                    formatter: function (cell) {
                        var input = document.createElement('input');
                        input.type = 'checkbox';
                        input.checked = cell.getValue();
                        input.addEventListener('click', function () {
                            cell.getRow().update({'isdefault': $(this).prop('checked') ? 1 : 0});
                        });
                        return input;
                    }
                },
                {
                    title: "", width: 40, headerSort: false, hozAlign: "center", formatter:
                        function () {
                            return '<i class="icon fa fa-edit fa-fw"></i>';
                        },
                    cellClick: function (_, cell) {
                        var formdata = {'series': cell.getRow().getCell("series").getValue()};
                        ModalFactory.create({
                            type: ModalFactory.types.SAVE_CANCEL,
                            title: jsstrings[7],
                            body: getBody(contextid, formdata)
                        })
                            .then(function (modal) {
                                modal.setSaveButtonText(jsstrings[7]);
                                modal.setLarge();

                                // Reset modal on every open event.
                                modal.getRoot().on(ModalEvents.hidden, function () {
                                    modal.setBody(getBody(contextid, formdata));
                                }).bind(this);

                                // We want to hide the submit buttons every time it is opened.
                                modal.getRoot().on(ModalEvents.shown, function () {
                                    modal.getRoot().append('<style>[data-fieldtype=submit] { display: none ! important; }</style>');
                                }.bind(this));

                                modal.getRoot().on(ModalEvents.save, function (e) {
                                    e.preventDefault();
                                    modal.getRoot().find('form').submit();
                                });
                                modal.getRoot().on('submit', 'form', {'modal': modal, 'contextid': contextid}, submitFormAjax);

                                modal.show();
                            });
                    }
                },
                {
                    title: "", width: 40, headerSort: false, hozAlign: "center", formatter:
                        function () {
                            return '<i class="icon fa fa-trash fa-fw"></i>';
                        },
                    cellClick: function (e, cell) {
                        ModalFactory.create({
                            type: ModalFactory.types.SAVE_CANCEL,
                            title: jsstrings[5], // todo update strings, write that deleting
                            // the series will not delete opencast series
                            body: jsstrings[6]
                        })
                            .then(function (modal) {
                                modal.setSaveButtonText(jsstrings[12]);
                                modal.getRoot().on(ModalEvents.save, function () {
                                    cell.getRow().delete();
                                });
                                modal.show();
                            });
                    }
                }
            ],
        });

        $('#addrow-seriestable').click(function () {
            if (seriestable.getDataCount() === 0) {
                seriestable.addRow({'isdefault': 1}).then(function (row) {
                    setTimeout(function () {
                        row.getCell("series").edit(true);
                    }, 100);
                });
            } else {
                seriestable.addRow({'isdefault': 0}).then(function (row) {
                    setTimeout(function () {
                        row.getCell("series").edit(true);
                    }, 100);
                });
            }
        });

        // Create new series in modal
        // Button for connection a new series
        $('#createseries').click(function () {
            ModalFactory.create({
                type: ModalFactory.types.SAVE_CANCEL,
                title: jsstrings[4],
                body: getBody(contextid)
            })
                .then(function (modal) {
                    modal.setSaveButtonText(jsstrings[4]);
                    modal.setLarge();

                    // Reset modal on every open event.
                    modal.getRoot().on(ModalEvents.hidden, function () {
                        modal.setBody(getBody(contextid));
                    }).bind(this);

                    // We want to hide the submit buttons every time it is opened.
                    modal.getRoot().on(ModalEvents.shown, function () {
                        modal.getRoot().append('<style>[data-fieldtype=submit] { display: none ! important; }</style>');
                    }.bind(this));

                    modal.getRoot().on(ModalEvents.save, function (e) {
                        e.preventDefault();
                        modal.getRoot().find('form').submit();
                    });
                    modal.getRoot().on('submit', 'form', {'modal': modal, 'contextid': contextid,
                        'seriestable': seriestable}, submitFormAjax);

                    modal.show();
                });

        });

    });
};
