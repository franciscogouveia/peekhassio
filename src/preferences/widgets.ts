import Gtk from 'gi://Gtk';

export function iconButton(iconName: string, tooltipText: string): Gtk.Button {
    const button = new Gtk.Button({
        icon_name: iconName,
        tooltip_text: tooltipText,
        valign: Gtk.Align.CENTER,
    });
    button.add_css_class('flat');
    return button;
}
