# Generates web/data/schema.json and web/test/golden/cases.json from the original Elixir
# implementation (commit 367264d). Kept for provenance: the Phoenix app was removed after the
# JS port matched this output byte for byte. Run from a checkout of 367264d:
#   elixir web/test/golden/generate.exs
for f <- ~w(config_schema yaml_encoder config_builder) do
  Code.require_file("lib/fleet_config_generator/#{f}.ex")
end

alias FleetConfigGenerator.{ConfigBuilder, ConfigSchema}

sections = ConfigSchema.sections()

schema =
  Enum.map(sections, fn s ->
    %{
      key: Atom.to_string(s.key),
      yaml_key: s.yaml_key,
      flag_prefix: s.flag_prefix,
      title: s.title,
      description: s.description,
      fields:
        Enum.map(s.fields, fn f ->
          base = %{
            key: Atom.to_string(f.key),
            yaml_key: f.yaml_key,
            type: Atom.to_string(f.type),
            default: f.default,
            label: f.label,
            help: f.help
          }

          if Map.get(f, :options), do: Map.put(base, :options, f.options), else: base
        end)
    }
  end)

File.write!("web/data/schema.json", :json.format(schema) |> IO.iodata_to_binary())

sample = fn
  %{type: :integer}, i -> if rem(i, 2) == 0, do: "42", else: "-7"
  %{type: :boolean}, i -> if rem(i, 2) == 0, do: "true", else: "false"
  %{type: :select, options: [first | _]}, _ -> first
  %{type: :duration}, i -> Enum.at(["5m", "1h30m", "0", "500ms"], rem(i, 4))
  %{type: :bytesize}, i -> Enum.at(["10GiB", "500 KB", "1024", "2g"], rem(i, 4))
  %{type: :password}, _ -> "s3cret: #pass"
  %{type: :string}, i -> Enum.at(["plain", "with space", "yes", "123", "a: b", "-dash", "x #y"], rem(i, 7))
end

bad = fn
  %{type: :integer} -> "4x"
  %{type: :boolean} -> "maybe"
  %{type: :select} -> "nope"
  %{type: :duration} -> "5 minutes"
  %{type: :bytesize} -> "ten"
  _ -> "ok"
end

per_section_cases =
  Enum.flat_map(sections, fn s ->
    filled =
      s.fields
      |> Enum.with_index()
      |> Map.new(fn {f, i} -> {Atom.to_string(f.key), sample.(f, i)} end)

    invalid = Map.new(s.fields, fn f -> {Atom.to_string(f.key), bad.(f)} end)
    sk = Atom.to_string(s.key)

    [
      %{name: "#{sk}: all fields filled", values: %{sk => filled}, extra_yaml: ""},
      %{name: "#{sk}: all fields invalid", values: %{sk => invalid}, extra_yaml: ""},
      %{name: "#{sk}: whitespace is trimmed", values: %{sk => Map.new(s.fields, fn f -> {Atom.to_string(f.key), "  "} end)}, extra_yaml: ""}
    ]
  end)

all_filled =
  Map.new(sections, fn s ->
    {Atom.to_string(s.key),
     s.fields |> Enum.with_index() |> Map.new(fn {f, i} -> {Atom.to_string(f.key), sample.(f, i)} end)}
  end)

cases =
  per_section_cases ++
    [
      %{name: "empty", values: %{}, extra_yaml: ""},
      %{name: "extra yaml only", values: %{}, extra_yaml: "\n  filesystem:\n    status_log_file: /x\n\n"},
      %{name: "all sections plus extra", values: all_filled, extra_yaml: "foo: bar"},
      %{name: "unknown keys ignored", values: %{"mysql" => %{"nope" => "1", "address" => "db:3306"}, "ghost" => %{"a" => "b"}}, extra_yaml: ""}
    ]

out =
  Enum.map(cases, fn c ->
    # Case values are string-keyed; the builder wants atom keys, so map them back safely.
    values =
      Map.new(c.values, fn {sk, fields} ->
        case Enum.find(sections, &(Atom.to_string(&1.key) == sk)) do
          nil -> {String.to_atom("__unknown__"), %{}}
          s ->
            {s.key,
             Map.new(fields, fn {fk, v} ->
               case Enum.find(s.fields, &(Atom.to_string(&1.key) == fk)) do
                 nil -> {:__unknown__, v}
                 f -> {f.key, v}
               end
             end)}
        end
      end)

    r = ConfigBuilder.build(values, c.extra_yaml)

    Map.merge(c, %{
      expected: %{
        yaml: r.yaml,
        env: r.env,
        flags: r.flags,
        errors:
          Enum.map(r.errors, fn e ->
            %{section: Atom.to_string(e.section), field: Atom.to_string(e.field), label: e.label, message: e.message}
          end)
      }
    })
  end)

File.write!("web/test/golden/cases.json", :json.format(out) |> IO.iodata_to_binary())
IO.puts("wrote #{length(schema)} sections, #{length(out)} cases")
