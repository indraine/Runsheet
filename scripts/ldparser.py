""" Parser for MoTeC ld files - numpy-free version for stdlib-only envs.
Based on gotzl/ldparser, rewritten to use array module instead of numpy.
"""
import datetime
import struct
import array

class ldData(object):
    def __init__(self, head, channs):
        self.head = head
        self.channs = channs

    def __getitem__(self, item):
        if not isinstance(item, int):
            col = [n for n, x in enumerate(self.channs) if x.name == item]
            if len(col) != 1:
                raise Exception("Could get column", item, col)
            item = col[0]
        return self.channs[item]

    def __iter__(self):
        return iter([x.name for x in self.channs])

    @classmethod
    def fromfile(cls, f):
        return cls(*read_ldfile(f))

class ldEvent(object):
    fmt = '<64s64s1024sH'
    def __init__(self, name, session, comment, venue_ptr, venue):
        self.name, self.session, self.comment, self.venue_ptr, self.venue = \
            name, session, comment, venue_ptr, venue

    @classmethod
    def fromfile(cls, f):
        name, session, comment, venue_ptr = struct.unpack(
            ldEvent.fmt, f.read(struct.calcsize(ldEvent.fmt)))
        name, session, comment = map(decode_string, [name, session, comment])
        venue = None
        if venue_ptr > 0:
            f.seek(venue_ptr)
            venue = ldVenue.fromfile(f)
        return cls(name, session, comment, venue_ptr, venue)

class ldVenue(object):
    fmt = '<64s1034xH'
    def __init__(self, name, vehicle_ptr, vehicle):
        self.name, self.vehicle_ptr, self.vehicle = name, vehicle_ptr, vehicle

    @classmethod
    def fromfile(cls, f):
        name, vehicle_ptr = struct.unpack(ldVenue.fmt, f.read(struct.calcsize(ldVenue.fmt)))
        vehicle = None
        if vehicle_ptr > 0:
            f.seek(vehicle_ptr)
            vehicle = ldVehicle.fromfile(f)
        return cls(decode_string(name), vehicle_ptr, vehicle)

class ldVehicle(object):
    fmt = '<64s128xI32s32s'
    def __init__(self, id, weight, type, comment):
        self.id, self.weight, self.type, self.comment = id, weight, type, comment

    @classmethod
    def fromfile(cls, f):
        id, weight, type, comment = struct.unpack(ldVehicle.fmt, f.read(struct.calcsize(ldVehicle.fmt)))
        id, type, comment = map(decode_string, [id, type, comment])
        return cls(id, weight, type, comment)

class ldHead(object):
    fmt = '<' + (
        "I4x"     # ldmarker
        "II"      # chann_meta_ptr chann_data_ptr
        "20x"     # ??
        "I"       # event_ptr
        "24x"     # ??
        "HHH"     # unknown static (?) numbers
        "I"       # device serial
        "8s"      # device type
        "H"       # device version
        "H"       # unknown static (?) number
        "I"       # num_channs
        "4x"      # ??
        "16s"     # date
        "16x"     # ??
        "16s"     # time
        "16x"     # ??
        "64s"     # driver
        "64s"     # vehicleid
        "64x"     # ??
        "64s"     # venue
        "64x"     # ??
        "1024x"   # ??
        "I"       # enable "pro logging" (some magic number?)
        "66x"     # ??
        "64s"     # short comment
        "126x"    # ??
    )

    def __init__(self, meta_ptr, data_ptr, event_ptr, event, driver, vehicleid, venue, datetime, short_comment):
        self.meta_ptr, self.data_ptr, self.event_ptr, self.event, self.driver, self.vehicleid, \
        self.venue, self.datetime, self.short_comment = meta_ptr, data_ptr, event_ptr, event, \
                                                driver, vehicleid, venue, datetime, short_comment

    @classmethod
    def fromfile(cls, f):
        (_, meta_ptr, data_ptr, event_ptr,
            _, _, _,
            _, _, _, _, n,
            date, time,
            driver, vehicleid, venue,
            _, short_comment) = struct.unpack(ldHead.fmt, f.read(struct.calcsize(ldHead.fmt)))
        date, time, driver, vehicleid, venue, short_comment = \
            map(decode_string, [date, time, driver, vehicleid, venue, short_comment])

        try:
            _datetime = datetime.datetime.strptime('%s %s'%(date, time), '%d/%m/%Y %H:%M:%S')
        except ValueError:
            _datetime = datetime.datetime.strptime('%s %s'%(date, time), '%d/%m/%Y %H:%M')

        event = None
        if event_ptr > 0:
            f.seek(event_ptr)
            event = ldEvent.fromfile(f)
        return cls(meta_ptr, data_ptr, event_ptr, event, driver, vehicleid, venue, _datetime, short_comment)

class ldChan(object):
    fmt = '<' + (
        "IIII"    # prev_addr next_addr data_ptr n_data
        "H"       # some counter?
        "HHH"     # datatype datatype rec_freq
        "hhhh"    # shift mul scale dec_places
        "32s"     # name
        "8s"      # short name
        "12s"     # unit
        "40x"     # ? (40 bytes for ACC, 32 bytes for acti)
    )

    def __init__(self, _f, meta_ptr, prev_meta_ptr, next_meta_ptr, data_ptr, data_len,
                 dtype, dtype_size, freq, shift, mul, scale, dec,
                 name, short_name, unit):
        self._f = _f
        self.meta_ptr = meta_ptr
        self._data = None
        (self.prev_meta_ptr, self.next_meta_ptr, self.data_ptr, self.data_len,
        self.dtype, self.dtype_size, self.freq,
        self.shift, self.mul, self.scale, self.dec,
        self.name, self.short_name, self.unit) = prev_meta_ptr, next_meta_ptr, data_ptr, data_len,\
                                                 dtype, dtype_size, freq,\
                                                 shift, mul, scale, dec,\
                                                 name, short_name, unit

    @classmethod
    def fromfile(cls, _f, meta_ptr):
        with open(_f, 'rb') as f:
            f.seek(meta_ptr)
            (prev_meta_ptr, next_meta_ptr, data_ptr, data_len, _,
             dtype_a, dtype, freq, shift, mul, scale, dec,
             name, short_name, unit) = struct.unpack(ldChan.fmt, f.read(struct.calcsize(ldChan.fmt)))

        name, short_name, unit = map(decode_string, [name, short_name, unit])

        if dtype_a in [0x07]:
            typecodes = {2: 'f', 4: 'f', 8: 'd'}
            dtype_size = dtype
            dtype = typecodes.get(dtype)
        elif dtype_a in [0, 0x03, 0x05]:
            typecodes = {2: 'h', 4: 'i', 8: 'q'}
            dtype_size = dtype
            dtype = typecodes.get(dtype)
        elif dtype_a == 0x08 and dtype == 0x08:
            dtype_size = 8
            dtype = 'd'
        else:
            dtype_size = 0
            dtype = None

        return cls(_f, meta_ptr, prev_meta_ptr, next_meta_ptr, data_ptr, data_len,
                   dtype, dtype_size, freq, shift, mul, scale, dec, name, short_name, unit)

    @property
    def data(self):
        if self.dtype is None:
            raise ValueError(f'Channel {self.name} has unknown data type')
        if self._data is None:
            with open(self._f, 'rb') as f:
                f.seek(self.data_ptr)
                raw = f.read(self.data_len * self.dtype_size)
                arr = array.array(self.dtype, raw)
                self._data = [(x/self.scale * pow(10., -self.dec) + self.shift) * self.mul for x in arr]
                if len(self._data) != self.data_len:
                    raise ValueError("Not all data read!")
        return self._data

    def __str__(self):
        return 'chan %s (%s) [%s], %i Hz'%(self.name, self.short_name, self.unit, self.freq)

def decode_string(bytes_):
    try:
        return bytes_.decode('ascii').strip().rstrip('\0').strip()
    except Exception as e:
        print("Could not decode string: %s - %s"%(e, bytes_))
        return ""

def read_channels(f_, meta_ptr):
    chans = []
    while meta_ptr:
        chan_ = ldChan.fromfile(f_, meta_ptr)
        chans.append(chan_)
        meta_ptr = chan_.next_meta_ptr
    return chans

def read_ldfile(f_):
    with open(f_,'rb') as f:
        head_ = ldHead.fromfile(f)
    chans = read_channels(f_, head_.meta_ptr)
    return head_, chans
